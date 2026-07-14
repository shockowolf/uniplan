import { clearSessionCookie } from '@/lib/auth/cookie';
import { authenticatedJsonResponse } from '@/lib/api/responses';
import { resolveRequestSession } from '@/lib/auth/request';

export async function GET(request: Request) {
  try {
    const sessionContext = await resolveRequestSession(request);
    if (!sessionContext) {
      return authenticatedJsonResponse(
        { authenticated: false },
        {
          status: 401,
          headers: { 'Set-Cookie': clearSessionCookie() },
        },
      );
    }

    return authenticatedJsonResponse(
      {
        authenticated: true,
        user: {
          id: sessionContext.userId,
          companyId: sessionContext.companyId,
          companyCode: sessionContext.companyCode,
          companyName: sessionContext.companyName,
          email: sessionContext.email,
          name: sessionContext.name,
        },
        expiresAt: sessionContext.expiresAt.toISOString(),
      },
    );
  } catch (requestError) {
    const errorType =
      requestError instanceof Error ? requestError.name : 'UnknownError';
    console.error(`UNIPLAN session lookup failed (${errorType})`);
    return authenticatedJsonResponse(
      {
        error: {
          code: 'SESSION_LOOKUP_FAILED',
          message: '세션을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        },
      },
      { status: 503 },
    );
  }
}
