import { clearSessionCookie, readSessionCookie } from '@/lib/auth/cookie';
import {
  authenticatedJsonResponse,
  authenticatedResponse,
} from '@/lib/api/responses';
import { isSameOriginRequest } from '@/lib/auth/origin';
import {
  resolveSessionToken,
  revokeSessionWithAudit,
} from '@/lib/auth/session';
import {
  recordAuditEvent,
} from '@/lib/audit/service.server';
import { AuditOutcome } from '@prisma/client';
import { prisma } from '@/lib/db';

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
  let sessionContext: Awaited<ReturnType<typeof resolveSessionToken>> = null;
  try {
    sessionContext = sessionToken
      ? await resolveSessionToken(sessionToken)
      : null;
    if (sessionToken) await revokeSessionWithAudit(sessionToken);
  } catch (requestError) {
    if (sessionContext) {
      try {
        await recordAuditEvent(
          prisma,
          {
            companyId: sessionContext.companyId,
            actorUserId: sessionContext.userId,
          },
          {
            action: 'auth.logout',
            resourceType: 'auth_session',
            resourceId: sessionContext.sessionId,
            outcome: AuditOutcome.FAILED,
          },
        );
      } catch {
        // The response still fails closed and clears the browser cookie.
      }
    }
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
