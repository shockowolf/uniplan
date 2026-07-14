import { createSessionCookie } from '@/lib/auth/cookie';
import { loginWithPassword } from '@/lib/auth/login';
import { isSameOriginRequest } from '@/lib/auth/origin';

const genericLoginError = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: '회사 코드, 이메일 또는 비밀번호를 확인해 주세요.',
  },
};

function invalidOriginResponse() {
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

async function readCredentials(request: Request) {
  try {
    const requestBody: unknown = await request.json();
    if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      return null;
    }
    const credentials = requestBody as Record<string, unknown>;
    if (
      typeof credentials.companyCode !== 'string' ||
      typeof credentials.email !== 'string' ||
      typeof credentials.password !== 'string'
    ) {
      return null;
    }
    return {
      companyCode: credentials.companyCode,
      email: credentials.email,
      password: credentials.password,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return invalidOriginResponse();

  const credentials = await readCredentials(request);
  if (!credentials) {
    return Response.json(genericLoginError, { status: 401 });
  }

  try {
    const loginResult = await loginWithPassword(credentials);
    if (!loginResult) {
      return Response.json(genericLoginError, { status: 401 });
    }

    return Response.json(
      {
        user: loginResult.user,
        expiresAt: loginResult.expiresAt.toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
          'Set-Cookie': createSessionCookie(
            loginResult.token,
            loginResult.expiresAt,
          ),
        },
      },
    );
  } catch {
    return Response.json(
      {
        error: {
          code: 'AUTHENTICATION_UNAVAILABLE',
          message: '로그인을 처리할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        },
      },
      { status: 503 },
    );
  }
}
