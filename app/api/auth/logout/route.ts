import { clearSessionCookie, readSessionCookie } from '@/lib/auth/cookie';
import {
  authenticatedJsonResponse,
  authenticatedResponse,
} from '@/lib/api/responses';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { revokeSessionToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return authenticatedJsonResponse(
      {
        error: {
          code: 'INVALID_ORIGIN',
          message: '요청 출처를 확인할 수 없습니다.',
        },
      },
      { status: 403 },
    );
  }

  const sessionToken = readSessionCookie(request);
  try {
    if (sessionToken) await revokeSessionToken(sessionToken);
  } catch (requestError) {
    const errorType =
      requestError instanceof Error ? requestError.name : 'UnknownError';
    console.error(`UNIPLAN logout revocation failed (${errorType})`);
    return authenticatedJsonResponse(
      {
        error: {
          code: 'SESSION_REVOCATION_FAILED',
          message: '서버 세션을 종료하지 못했습니다. 다시 로그인해 주세요.',
        },
      },
      {
        status: 503,
        headers: { 'Set-Cookie': clearSessionCookie() },
      },
    );
  }

  return authenticatedResponse(null, {
    status: 204,
    headers: {
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
