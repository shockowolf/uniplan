import { createSessionCookie } from '@/lib/auth/cookie';
import { loginWithPassword } from '@/lib/auth/login';
import { readBoundedLoginJson } from '@/lib/auth/login-body';
import { isSameOriginRequest } from '@/lib/auth/origin';
import { consumeLoginAttempt } from '@/lib/auth/rate-limit';
import { authenticatedJsonResponse } from '@/lib/api/responses';

const genericLoginError = {
  error: {
    code: 'INVALID_CREDENTIALS',
    message: '회사 코드, 이메일 또는 비밀번호를 확인해 주세요.',
  },
};

function invalidOriginResponse() {
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

function readCredentials(requestBody: unknown) {
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
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return invalidOriginResponse();

  const boundedBody = await readBoundedLoginJson(request);
  if (boundedBody.status === 'too_large') {
    return authenticatedJsonResponse(
      {
        error: {
          code: 'REQUEST_TOO_LARGE',
          message: '로그인 요청이 너무 큽니다.',
        },
      },
      { status: 413 },
    );
  }
  const credentials =
    boundedBody.status === 'ok' ? readCredentials(boundedBody.value) : null;
  if (!credentials) {
    return authenticatedJsonResponse(genericLoginError, { status: 401 });
  }

  try {
    const limiterResult = await consumeLoginAttempt(credentials);
    if (!limiterResult.allowed) {
      return authenticatedJsonResponse(
        {
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(limiterResult.retryAfterSeconds),
          },
        },
      );
    }

    const loginResult = await loginWithPassword(credentials, undefined, {
      identityBucketKey: limiterResult.identityBucketKey,
    });
    if (!loginResult) {
      return authenticatedJsonResponse(genericLoginError, { status: 401 });
    }

    return authenticatedJsonResponse(
      {
        user: loginResult.user,
        expiresAt: loginResult.expiresAt.toISOString(),
      },
      {
        headers: {
          'Set-Cookie': createSessionCookie(
            loginResult.token,
            loginResult.expiresAt,
          ),
        },
      },
    );
  } catch {
    return authenticatedJsonResponse(
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
