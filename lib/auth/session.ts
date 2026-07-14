import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

export const SESSION_COOKIE_NAME = 'uniplan_session';
export const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MIN_SESSION_TTL_SECONDS = 5 * 60;
export const MAX_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_CREATION_ATTEMPTS = 2;

export type SessionContext = {
  sessionId: string;
  userId: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  email: string;
  name: string;
  expiresAt: Date;
};

function validateSessionTtlSeconds(value: number) {
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_SESSION_TTL_SECONDS ||
    value > MAX_SESSION_TTL_SECONDS
  ) {
    throw new Error(
      `Session TTL must be between ${MIN_SESSION_TTL_SECONDS} and ${MAX_SESSION_TTL_SECONDS} seconds.`,
    );
  }
  return value;
}

export function getSessionTtlSeconds(
  configuredValue = process.env.UNIPLAN_AUTH_SESSION_TTL_SECONDS,
) {
  if (configuredValue === undefined || configuredValue.trim() === '') {
    return DEFAULT_SESSION_TTL_SECONDS;
  }
  if (!/^\d+$/.test(configuredValue)) {
    throw new Error('UNIPLAN_AUTH_SESSION_TTL_SECONDS must be an integer.');
  }
  return validateSessionTtlSeconds(Number(configuredValue));
}

export function generateSessionToken() {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function isValidSessionToken(token: string) {
  return SESSION_TOKEN_PATTERN.test(token);
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createAuthSession(
  userId: string,
  databaseClient: PrismaClient = prisma,
  options: { now?: Date; ttlSeconds?: number } = {},
) {
  const now = options.now ?? new Date();
  const ttlSeconds = validateSessionTtlSeconds(
    options.ttlSeconds ?? getSessionTtlSeconds(),
  );
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1_000);

  for (let attempt = 0; attempt < SESSION_CREATION_ATTEMPTS; attempt += 1) {
    const token = generateSessionToken();
    try {
      const storedSession = await databaseClient.authSession.create({
        data: {
          userId,
          tokenHash: hashSessionToken(token),
          expiresAt,
        },
        select: { id: true },
      });
      return { token, sessionId: storedSession.id, expiresAt };
    } catch (requestError) {
      const isTokenCollision =
        requestError instanceof Prisma.PrismaClientKnownRequestError &&
        requestError.code === 'P2002';
      if (!isTokenCollision || attempt === SESSION_CREATION_ATTEMPTS - 1) {
        throw requestError;
      }
    }
  }

  throw new Error('Unable to create an authentication session.');
}

export async function resolveSessionToken(
  token: string,
  databaseClient: PrismaClient = prisma,
  now = new Date(),
): Promise<SessionContext | null> {
  if (!isValidSessionToken(token)) return null;

  const storedSession = await databaseClient.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          companyId: true,
          email: true,
          name: true,
          status: true,
          company: {
            select: { code: true, name: true, active: true },
          },
        },
      },
    },
  });

  if (
    !storedSession ||
    storedSession.revokedAt !== null ||
    storedSession.expiresAt.getTime() <= now.getTime() ||
    storedSession.user.status !== 'active' ||
    !storedSession.user.company.active
  ) {
    return null;
  }

  return {
    sessionId: storedSession.id,
    userId: storedSession.user.id,
    companyId: storedSession.user.companyId,
    companyCode: storedSession.user.company.code,
    companyName: storedSession.user.company.name,
    email: storedSession.user.email,
    name: storedSession.user.name,
    expiresAt: storedSession.expiresAt,
  };
}

export async function revokeSessionToken(
  token: string,
  databaseClient: PrismaClient = prisma,
  revokedAt = new Date(),
) {
  if (!isValidSessionToken(token)) return false;
  const result = await databaseClient.authSession.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      revokedAt: null,
    },
    data: { revokedAt },
  });
  return result.count > 0;
}
