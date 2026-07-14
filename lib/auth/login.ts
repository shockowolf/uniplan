import type { PrismaClient } from '@prisma/client';
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '@/lib/auth/password';
import { createAuthSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';

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
  options: { now?: Date; ttlSeconds?: number } = {},
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

  const authSession = await createAuthSession(invitedUser.id, databaseClient, {
    now: options.now,
    ttlSeconds: options.ttlSeconds,
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
    select: { id: true },
    take: 2,
  });
  if (matchingUsers.length !== 1) {
    throw new Error(
      'Exactly one invited user must match the company code and email.',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const passwordChangedAt = new Date();
  await databaseClient.$transaction([
    databaseClient.user.update({
      where: { id: matchingUsers[0].id },
      data: { passwordHash },
    }),
    databaseClient.authSession.updateMany({
      where: { userId: matchingUsers[0].id, revokedAt: null },
      data: { revokedAt: passwordChangedAt },
    }),
  ]);
  return { userId: matchingUsers[0].id };
}
