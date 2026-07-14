import { answerQuestion } from '@/lib/ai/orchestrator';
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
      return Response.json({ error: 'message is required' }, { status: 400 });
    }

    return Response.json(
      await answerQuestion(message, sessionContext.companyId),
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
