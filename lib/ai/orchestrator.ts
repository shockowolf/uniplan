import { mergeEntityParams, resolveEntities } from '@/lib/ai/entities';
import {
  getIntentClassifier,
  templateFromClassification,
} from '@/lib/ai/intent';
import { fallbackResult } from '@/lib/templates/registry';
import { ChatResult } from '@/lib/templates/types';

export type { ChatResult };

export async function answerQuestion(
  message: string,
  companyId: string,
): Promise<ChatResult> {
  const intentClassifier = getIntentClassifier();
  const intentClassification = await intentClassifier.classify(message);
  const selectedQueryTemplate =
    templateFromClassification(intentClassification);

  if (!selectedQueryTemplate) return fallbackResult();

  const resolvedEntities = await resolveEntities(message, companyId);
  const mergedTemplateParameters = mergeEntityParams(
    intentClassification.params,
    resolvedEntities,
  );
  const templateResult = await selectedQueryTemplate.run({
    companyId,
    params: mergedTemplateParameters,
  });
  return {
    ...templateResult,
    message: templateResult.message,
  };
}
