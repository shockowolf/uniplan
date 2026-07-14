import { answerQuestion } from '@/lib/ai/orchestrator';
import { apiError, authenticatedJsonResponse } from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { DomainError } from '@/lib/domain/errors';

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'dashboard.analytics',
      'read',
    );
    return authenticatedJsonResponse(
      await answerQuestion('오늘 사업 현황 요약', sessionContext.companyId),
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
