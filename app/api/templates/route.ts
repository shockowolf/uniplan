import { buildClassifierPrompt } from '@/lib/ai/intent';
import { apiError, authenticatedJsonResponse } from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { DomainError } from '@/lib/domain/errors';
import { templates } from '@/lib/templates/registry';

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, 'dashboard.analytics', 'read');
    return authenticatedJsonResponse({
      intentMode: process.env.UNIPLAN_INTENT_MODE ?? 'keyword',
      templates: templates.map((template) => ({
        id: template.id,
        title: template.title,
        examples: template.examples,
        keywords: template.keywords,
      })),
      classifierPromptPreview: buildClassifierPrompt('이번 달 매출 어때?'),
    });
  } catch (requestError) {
    if (requestError instanceof DomainError) {
      return authenticatedJsonResponse(
        { error: requestError.code },
        { status: requestError.status },
      );
    }
    return apiError(requestError);
  }
}
