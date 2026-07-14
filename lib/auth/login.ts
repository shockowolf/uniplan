import type { PrismaClient } from '@prisma/client';
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '@/lib/auth/password';
import { clearLoginIdentityBucket } from '@/lib/auth/rate-limit';
import {
  createAuthSession,
  enforceActiveSessionLimit,
} from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import {
  recordAuditEvent,
  systemAuditContext,
  type AuditWriteHooks,
} from '@/lib/audit/service.server';

const MAX_COMPANY_CODE_LENGTH = 100;
const MAX_EMAIL_LENGTH = 320;
const MAX_LOGIN_PASSWORD_BYTES = 1_024;
const INVALID_PASSWORD_HASH = 'invalid-password-hash';

export type LoginCredentials = {
  companyCode: string;
  email: string;
  password: string;
};

function normalizeLoginCredentials(credentials: LoginCredentials) {
  return {
    companyCode: credentials.companyCode.trim(),
    email: credentials.email.trim(),
    password: credentials.password,
  };
}

function hasBoundedLoginCredentials(credentials: LoginCredentials) {
  return Boolean(
    credentials.companyCode &&
      credentials.companyCode.length <= MAX_COMPANY_CODE_LENGTH &&
      credentials.email &&
      credentials.email.length <= MAX_EMAIL_LENGTH &&
      credentials.password &&
      Buffer.byteLength(credentials.password, 'utf8') <=
        MAX_LOGIN_PASSWORD_BYTES,
  );
}

export async function loginWithPassword(
  suppliedCredentials: LoginCredentials,
  databaseClient: PrismaClient = prisma,
  options: {
    now?: Date;
    ttlSeconds?: number;
    identityBucketKey?: string;
    auditHooks?: AuditWriteHooks;
  } = {},
) {
  const credentials = normalizeLoginCredentials(suppliedCredentials);
  if (!hasBoundedLoginCredentials(credentials)) return null;

  const matchingUsers = await databaseClient.user.findMany({
    where: {
      email: { equals: credentials.email, mode: 'insensitive' },
      status: 'active',
      company: {
        code: { equals: credentials.companyCode, mode: 'insensitive' },
        active: true,
      },
    },
    select: {
      id: true,
      companyId: true,
      email: true,
      name: true,
      passwordHash: true,
      company: { select: { code: true, name: true } },
    },
    take: 2,
  });
  const invitedUser = matchingUsers.length === 1 ? matchingUsers[0] : null;

  const passwordMatches = await verifyPassword(
    credentials.password,
    invitedUser?.passwordHash ?? INVALID_PASSWORD_HASH,
  );
  if (!invitedUser || !passwordMatches) return null;

  const loginCompletedAt = options.now ?? new Date();
  const authSession = await databaseClient.$transaction(async (transaction) => {
    // Serialize successful logins for this user so the active-session cap is
    // reliable across app processes. The limiter bucket is cleared in the same
    // transaction as session creation, so a rolled-back login cannot relax it.
    await transaction.$queryRaw`
      SELECT "id" FROM "users" WHERE "id" = ${invitedUser.id} FOR UPDATE
    `;
    const createdSession = await createAuthSession(
      invitedUser.id,
      transaction,
      {
        now: loginCompletedAt,
        ttlSeconds: options.ttlSeconds,
      },
    );
    await enforceActiveSessionLimit(
      invitedUser.id,
      createdSession.sessionId,
      transaction,
      loginCompletedAt,
    );
    if (options.identityBucketKey) {
      await clearLoginIdentityBucket(
        options.identityBucketKey,
        transaction,
      );
    }
    await recordAuditEvent(
      transaction,
      {
        companyId: invitedUser.companyId,
        actorUserId: invitedUser.id,
      },
      {
        action: 'auth.login',
        resourceType: 'auth_session',
        resourceId: createdSession.sessionId,
      },
      options.auditHooks,
    );
    return createdSession;
  });
  return {
    ...authSession,
    user: {
      id: invitedUser.id,
      companyId: invitedUser.companyId,
      companyCode: invitedUser.company.code,
      companyName: invitedUser.company.name,
      email: invitedUser.email,
      name: invitedUser.name,
    },
  };
}

export async function setInvitedUserPassword(
  input: { companyCode: string; email: string; password: string },
  databaseClient: PrismaClient = prisma,
) {
  const companyCode = input.companyCode.trim();
  const email = input.email.trim();
  validateNewPassword(input.password);

  const matchingUsers = await databaseClient.user.findMany({
    where: {
      email: { equals: email, mode: 'insensitive' },
      company: {
        code: { equals: companyCode, mode: 'insensitive' },
      },
    },
    select: { id: true, companyId: true },
    take: 2,
  });
  if (matchingUsers.length !== 1) {
    throw new Error(
      'Exactly one invited user must match the company code and email.',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const passwordChangedAt = new Date();
  const revokedSessionCount = await databaseClient.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: matchingUsers[0].id },
      data: { passwordHash },
    });
    const revokedSessions = await transaction.authSession.updateMany({
      where: { userId: matchingUsers[0].id, revokedAt: null },
      data: { revokedAt: passwordChangedAt },
    });
    await recordAuditEvent(
      transaction,
      systemAuditContext(matchingUsers[0].companyId),
      {
        action: 'auth.password_reset',
        resourceType: 'user',
        resourceId: matchingUsers[0].id,
        metadata: { revokedSessionCount: revokedSessions.count },
      },
    );
    return revokedSessions.count;
  });
  return { userId: matchingUsers[0].id, revokedSessionCount };
}

export async function resolveLoginAuditCompanyId(
  companyCode: string,
  databaseClient: PrismaClient = prisma,
) {
  const companies = await databaseClient.company.findMany({
    where: {
      code: { equals: companyCode.trim(), mode: 'insensitive' },
      active: true,
    },
    select: { id: true },
    take: 2,
  });
  return companies.length === 1 ? companies[0].id : null;
}
