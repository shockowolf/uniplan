import { buildClassifierPrompt } from '@/lib/ai/intent';
import { templates } from '@/lib/templates/registry';

export async function GET() {
  return Response.json({
    intentMode: process.env.UNIPLAN_INTENT_MODE ?? 'keyword',
    templates: templates.map((template) => ({
      id: template.id,
      title: template.title,
      examples: template.examples,
      keywords: template.keywords
    })),
    classifierPromptPreview: buildClassifierPrompt('이번 달 매출 어때?')
  });
}
