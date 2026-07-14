import { clearSessionCookie, readSessionCookie } from '@/lib/auth/cookie';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { revokeSessionToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json(
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
  if (sessionToken) await revokeSessionToken(sessionToken);

  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
