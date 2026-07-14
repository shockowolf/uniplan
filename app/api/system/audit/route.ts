import { AuditOutcome, Prisma } from '@prisma/client';
import { apiError, apiSuccess } from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { AUDIT_ACTIONS, type AuditAction } from '@/lib/audit/service.server';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/domain/errors';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;
const MAX_CURSOR_BYTES = 512;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ACTION_SET = new Set<string>(AUDIT_ACTIONS);

type AuditCursor = { createdAt: string; id: string };

function oneQueryValue(url: URL, key: string) {
  const values = url.searchParams.getAll(key);
  if (values.length > 1) throw new ValidationError(`${key} is invalid`);
  return values[0] ?? null;
}

function parsePageSize(value: string | null) {
  if (value === null) return DEFAULT_PAGE_SIZE;
  if (!/^\d{1,3}$/.test(value)) throw new ValidationError('limit is invalid');
  const pageSize = Number(value);
  if (pageSize < 1 || pageSize > MAX_PAGE_SIZE)
    throw new ValidationError('limit is invalid');
  return pageSize;
}

function parseDate(value: string | null, fallback: Date, field: string) {
  if (value === null) return fallback;
  if (value.length > 40) throw new ValidationError(`${field} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()))
    throw new ValidationError(`${field} is invalid`);
  return parsed;
}

function parseCursor(value: string | null): { createdAt: Date; id: string } | null {
  if (value === null) return null;
  if (Buffer.byteLength(value, 'utf8') > MAX_CURSOR_BYTES)
    throw new ValidationError('cursor is invalid');
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as AuditCursor;
    const createdAt = new Date(parsed.createdAt);
    if (
      !parsed ||
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(createdAt.valueOf()) ||
      typeof parsed.id !== 'string' ||
      !UUID_PATTERN.test(parsed.id)
    ) {
      throw new Error('invalid');
    }
    return { createdAt, id: parsed.id };
  } catch {
    throw new ValidationError('cursor is invalid');
  }
}

function encodeCursor(cursor: AuditCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function parseOutcome(value: string | null) {
  if (value === null) return undefined;
  const outcomeByPublicValue = {
    succeeded: AuditOutcome.SUCCEEDED,
    denied: AuditOutcome.DENIED,
    failed: AuditOutcome.FAILED,
  } as const;
  const outcome = outcomeByPublicValue[value as keyof typeof outcomeByPublicValue];
  if (!outcome) throw new ValidationError('outcome is invalid');
  return outcome;
}

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'system.audit',
      'read',
    );
    const requestUrl = new URL(request.url);
    const pageSize = parsePageSize(oneQueryValue(requestUrl, 'limit'));
    const now = new Date();
    const to = parseDate(oneQueryValue(requestUrl, 'to'), now, 'to');
    const from = parseDate(
      oneQueryValue(requestUrl, 'from'),
      new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1_000),
      'from',
    );
    if (
      from > to ||
      to.getTime() - from.getTime() > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1_000
    ) {
      throw new ValidationError('audit time range is invalid');
    }
    const actionValue = oneQueryValue(requestUrl, 'action');
    if (actionValue !== null && !ACTION_SET.has(actionValue))
      throw new ValidationError('action is invalid');
    const resourceType = oneQueryValue(requestUrl, 'resourceType');
    if (resourceType !== null && !RESOURCE_TYPE_PATTERN.test(resourceType))
      throw new ValidationError('resourceType is invalid');
    const resourceId = oneQueryValue(requestUrl, 'resourceId');
    if (resourceId !== null && !RESOURCE_ID_PATTERN.test(resourceId))
      throw new ValidationError('resourceId is invalid');
    const outcome = parseOutcome(oneQueryValue(requestUrl, 'outcome'));
    const cursor = parseCursor(oneQueryValue(requestUrl, 'cursor'));

    const cursorPredicate: Prisma.AuditEventWhereInput | undefined = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : undefined;
    const rows = await prisma.auditEvent.findMany({
      where: {
        companyId: sessionContext.companyId,
        createdAt: { gte: from, lte: to },
        ...(actionValue ? { action: actionValue as AuditAction } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(resourceId ? { resourceId } : {}),
        ...(outcome ? { outcome } : {}),
        ...(cursorPredicate ?? {}),
      },
      select: {
        id: true,
        actorUserId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        outcome: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });
    const hasNextPage = rows.length > pageSize;
    const pageRows = hasNextPage ? rows.slice(0, pageSize) : rows;
    const lastRow = pageRows.at(-1);
    return apiSuccess({
      events: pageRows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        outcome: row.outcome.toLowerCase(),
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor:
        hasNextPage && lastRow
          ? encodeCursor({
              createdAt: lastRow.createdAt.toISOString(),
              id: lastRow.id,
            })
          : null,
    });
  } catch (requestError) {
    return apiError(requestError);
  }
}
