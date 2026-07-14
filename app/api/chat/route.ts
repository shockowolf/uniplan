import { answerQuestion } from '@/lib/ai/orchestrator';
import { apiError, authenticatedJsonResponse } from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { DomainError } from '@/lib/domain/errors';

export async function POST(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'dashboard.analytics',
      'read',
    );
    const requestBody = (await request.json()) as { message?: string };
    const message = requestBody.message?.trim();

    if (!message) {
      return authenticatedJsonResponse(
        { error: 'message is required' },
        { status: 400 },
      );
    }

    return authenticatedJsonResponse(
      await answerQuestion(message, sessionContext.companyId),
    );
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
