import { demoCompanyId } from '@/lib/db';
import { mergeEntityParams, resolveEntities } from '@/lib/ai/entities';
import { getIntentClassifier, templateFromClassification } from '@/lib/ai/intent';
import { fallbackResult } from '@/lib/templates/registry';
import { ChatResult } from '@/lib/templates/types';

export type { ChatResult };

export async function answerQuestion(message: string, companyId = demoCompanyId): Promise<ChatResult> {
  const classifier = getIntentClassifier();
  const classification = await classifier.classify(message);
  const template = templateFromClassification(classification);

  if (!template) return fallbackResult();

  const entities = await resolveEntities(message, companyId);
  const params = mergeEntityParams(classification.params, entities);
  const result = await template.run({ companyId, params });
  return {
    ...result,
    message: result.message
  };
}
