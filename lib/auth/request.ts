import type { PrismaClient } from '@prisma/client';
import { readSessionCookie } from '@/lib/auth/cookie';
import { isSameOriginRequest } from '@/lib/auth/origin';
import {
  type PermissionAction,
  requirePermission,
} from '@/lib/auth/permissions';
import { prisma } from '@/lib/db';
import { resolveSessionToken } from '@/lib/auth/session';
import {
  InvalidOriginError,
  UnauthorizedError,
} from '@/lib/domain/errors';

export async function resolveRequestSession(
  request: Request,
  databaseClient: PrismaClient = prisma,
  now = new Date(),
) {
  const sessionToken = readSessionCookie(request);
  if (!sessionToken) return null;
  return resolveSessionToken(sessionToken, databaseClient, now);
}

function isStateChangingRequest(request: Request) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
}

type PermissionActionResolver =
  | PermissionAction
  | (() => PermissionAction | Promise<PermissionAction>);

export async function authorizeRequest(
  request: Request,
  resourceCode: string,
  action: PermissionActionResolver = 'read',
  databaseClient: PrismaClient = prisma,
  now = new Date(),
) {
  const sessionContext = await resolveRequestSession(
    request,
    databaseClient,
    now,
  );
  if (!sessionContext) throw new UnauthorizedError();

  if (isStateChangingRequest(request) && !isSameOriginRequest(request)) {
    throw new InvalidOriginError();
  }

  const resolvedAction =
    typeof action === 'function' ? await action() : action;

  await requirePermission(
    {
      companyId: sessionContext.companyId,
      userId: sessionContext.userId,
      resourceCode,
      action: resolvedAction,
    },
    databaseClient,
  );
  return sessionContext;
}
