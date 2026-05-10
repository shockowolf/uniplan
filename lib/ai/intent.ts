import { parseDateRange, serializeDateRange } from '@/lib/ai/dateRange';
import { findTemplateByKeyword, findTemplateById, templates } from '@/lib/templates/registry';
import { QueryTemplate } from '@/lib/templates/types';

export type IntentClassification = {
  templateId: string | null;
  confidence: number;
  source: 'keyword' | 'llm' | 'fallback';
  reason?: string;
  params?: Record<string, string | number | boolean | null>;
};

export type IntentClassifier = {
  classify: (message: string) => Promise<IntentClassification>;
};

export const keywordIntentClassifier: IntentClassifier = {
  async classify(message) {
    const template = findTemplateByKeyword(message);
    if (!template) {
      return {
        templateId: null,
        confidence: 0,
        source: 'fallback',
        reason: 'No keyword matched a registered template.'
      };
    }

    const dateRange = serializeDateRange(parseDateRange(message));

    return {
      templateId: template.id,
      confidence: 0.72,
      source: 'keyword',
      reason: `Matched keywords for ${template.id}.`,
      params: {
        dateLabel: dateRange.label,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo
      }
    };
  }
};

export function buildClassifierPrompt(message: string) {
  const templateList = templates
    .map((template) => ({
      id: template.id,
      title: template.title,
      examples: template.examples,
      keywords: template.keywords
    }));

  return `You are an intent classifier for UniPlan AI ERP.\n\nRules:\n- Choose exactly one templateId from the allowed list, or null if unsupported.\n- Never generate SQL.\n- Only extract safe parameters such as date range, limit, customer/product/employee names.\n- Return strict JSON only.\n\nAllowed templates:\n${JSON.stringify(templateList, null, 2)}\n\nUser message:\n${JSON.stringify(message)}\n\nReturn shape:\n{\"templateId\": string|null, \"confidence\": number, \"params\": object, \"reason\": string}`;
}

/**
 * LLM-ready classifier shell.
 *
 * MVP note:
 * This intentionally does not call an external model yet. The app remains fully local
 * and deterministic. When an LLM provider is added, wire it here and keep the rule:
 * LLM chooses templateId/params only; SQL still comes from the registry.
 */
export function createLlmIntentClassifier(): IntentClassifier {
  return {
    async classify(message) {
      const keywordResult = await keywordIntentClassifier.classify(message);
      return {
        ...keywordResult,
        source: keywordResult.templateId ? 'llm' : 'fallback',
        reason: keywordResult.templateId
          ? 'LLM classifier shell used keyword result until provider is configured.'
          : 'LLM classifier shell found no supported template until provider is configured.'
      };
    }
  };
}

export function templateFromClassification(classification: IntentClassification): QueryTemplate | null {
  if (!classification.templateId) return null;
  return findTemplateById(classification.templateId) ?? null;
}

export function getIntentClassifier(): IntentClassifier {
  if (process.env.UNIPLAN_INTENT_MODE === 'llm') {
    return createLlmIntentClassifier();
  }
  return keywordIntentClassifier;
}
