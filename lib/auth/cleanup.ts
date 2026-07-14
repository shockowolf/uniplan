import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  recordAuditEvent,
  systemAuditContext,
} from '@/lib/audit/service.server';

export const DEFAULT_AUTH_RECORD_RETENTION_DAYS = 7;
export const MAX_AUTH_RECORD_RETENTION_DAYS = 365;
const MAX_CLEANUP_AUDIT_TENANTS = 1_000;

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

  return databaseClient.$transaction(async (transaction) => {
    const companies = await transaction.company.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      take: MAX_CLEANUP_AUDIT_TENANTS + 1,
    });
    if (companies.length > MAX_CLEANUP_AUDIT_TENANTS) {
      throw new Error('Authentication cleanup tenant bound exceeded.');
    }
    const sessionsByCompany = await transaction.authSession.groupBy({
      by: ['companyId'],
      where: {
        OR: [
          { expiresAt: { lte: sessionCutoff } },
          { revokedAt: { lte: sessionCutoff } },
        ],
      },
      _count: { _all: true },
    });
    const deletedBuckets = await transaction.loginRateLimitBucket.deleteMany({
      where: { windowExpiresAt: { lte: now } },
    });
    const deletedSessions = await transaction.authSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lte: sessionCutoff } },
          { revokedAt: { lte: sessionCutoff } },
        ],
      },
    });
    const deletedSessionCountByCompany = new Map(
      sessionsByCompany.map((entry) => [entry.companyId, entry._count._all]),
    );
    for (const company of companies) {
      await recordAuditEvent(
        transaction,
        systemAuditContext(company.id),
        {
          action: 'auth.cleanup',
          resourceType: 'authentication_state',
          metadata: {
            deletedLoginRateLimitBucketCount: deletedBuckets.count,
            deletedSessionCount:
              deletedSessionCountByCompany.get(company.id) ?? 0,
          },
        },
      );
    }
    return {
      deletedLoginRateLimitBuckets: deletedBuckets.count,
      deletedAuthSessions: deletedSessions.count,
    };
  });
}
