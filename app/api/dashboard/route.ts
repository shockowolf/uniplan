import { answerQuestion } from '@/lib/ai/orchestrator';
import { authorizeRequest } from '@/lib/auth/request';
import { DomainError } from '@/lib/domain/errors';

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'dashboard.analytics',
      'read',
    );
    return Response.json(
      await answerQuestion('오늘 사업 현황 요약', sessionContext.companyId),
    );
  } catch (requestError) {
    if (requestError instanceof DomainError) {
      return Response.json(
        { error: requestError.code },
        { status: requestError.status },
      );
    }
    throw requestError;
  }
}
