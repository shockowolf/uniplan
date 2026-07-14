import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

export const DEFAULT_AUTH_RECORD_RETENTION_DAYS = 7;
export const MAX_AUTH_RECORD_RETENTION_DAYS = 365;

export function getAuthRecordRetentionDays(
  configuredValue = process.env.UNIPLAN_AUTH_RECORD_RETENTION_DAYS,
) {
  if (configuredValue === undefined || configuredValue.trim() === '') {
    return DEFAULT_AUTH_RECORD_RETENTION_DAYS;
  }
  if (!/^\d+$/.test(configuredValue)) {
    throw new Error('UNIPLAN_AUTH_RECORD_RETENTION_DAYS must be an integer.');
  }
  const retentionDays = Number(configuredValue);
  if (
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > MAX_AUTH_RECORD_RETENTION_DAYS
  ) {
    throw new Error(
      `UNIPLAN_AUTH_RECORD_RETENTION_DAYS must be between 1 and ${MAX_AUTH_RECORD_RETENTION_DAYS}.`,
    );
  }
  return retentionDays;
}

export async function cleanupAuthenticationState(
  databaseClient: PrismaClient = prisma,
  options: { now?: Date; retentionDays?: number } = {},
) {
  const now = options.now ?? new Date();
  const retentionDays =
    options.retentionDays ?? getAuthRecordRetentionDays();
  if (
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < 1 ||
    retentionDays > MAX_AUTH_RECORD_RETENTION_DAYS
  ) {
    throw new Error('Invalid authentication record retention period.');
  }
  const sessionCutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1_000,
  );

  const [deletedBuckets, deletedSessions] = await databaseClient.$transaction([
    databaseClient.loginRateLimitBucket.deleteMany({
      where: { windowExpiresAt: { lte: now } },
    }),
    databaseClient.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: sessionCutoff } },
          { revokedAt: { lte: sessionCutoff } },
        ],
      },
    }),
  ]);

  return {
    deletedLoginRateLimitBuckets: deletedBuckets.count,
    deletedAuthSessions: deletedSessions.count,
  };
}
