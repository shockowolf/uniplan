import { AuditOutcome } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as getAuditEvents } from '@/app/api/system/audit/route';
import { recordStandaloneAuditEvent } from '@/lib/audit/service.server';
import { createAuthSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

async function createAuditReader(companyCode: string, canRead: boolean) {
  const company = await createTestCompany(companyCode);
  const user = await testDatabaseClient.user.create({
    data: {
      companyId: company.id,
      email: `reader-${companyCode.toLowerCase()}@test.invalid`,
      passwordHash: 'test-only',
      name: 'Audit Reader',
    },
  });
  const role = await testDatabaseClient.role.create({
    data: { companyId: company.id, code: 'audit-reader', name: 'Audit Reader' },
  });
  const menuItem = await testDatabaseClient.menuItem.create({
    data: {
      companyId: company.id,
      code: 'system-audit',
      label: 'Audit',
      href: '/system',
      resourceCode: 'system.audit',
    },
  });
  await testDatabaseClient.userRole.create({
    data: { companyId: company.id, userId: user.id, roleId: role.id },
  });
  await testDatabaseClient.rolePermission.create({
    data: {
      companyId: company.id,
      roleId: role.id,
      menuItemId: menuItem.id,
      canRead,
    },
  });
  const session = await createAuthSession(user.id, testDatabaseClient);
  return { company, user, session };
}

function auditRequest(query = '', token?: string) {
  return new Request(`http://localhost/api/system/audit${query}`, {
    headers: token
      ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` }
      : undefined,
  });
}

describe('tenant audit cursor API', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  it('requires a real session and the dedicated system.audit read permission', async () => {
    const forbiddenReader = await createAuditReader('AUDIT-FORBIDDEN', false);
    const unauthorized = await getAuditEvents(auditRequest());
    const forbidden = await getAuditEvents(
      auditRequest('', forbiddenReader.session.token),
    );

    expect(unauthorized.status).toBe(401);
    expect(forbidden.status).toBe(403);
    for (const response of [unauthorized, forbidden]) {
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toBe('Cookie');
    }
  });

  it('isolates tenants, filters safely, paginates newest-first, and hides hashes', async () => {
    const readerA = await createAuditReader('AUDIT-API-A', true);
    const readerB = await createAuditReader('AUDIT-API-B', true);
    await recordStandaloneAuditEvent(
      { companyId: readerA.company.id, actorUserId: readerA.user.id },
      {
        action: 'item.created',
        resourceType: 'item',
        resourceId: 'item-a-1',
        correlationMaterial: 'request-a',
      },
      testDatabaseClient,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await recordStandaloneAuditEvent(
      { companyId: readerA.company.id, actorUserId: readerA.user.id },
      {
        action: 'item.updated',
        resourceType: 'item',
        resourceId: 'item-a-2',
        outcome: AuditOutcome.SUCCEEDED,
        idempotencyMaterial: 'idempotency-a',
      },
      testDatabaseClient,
    );
    await recordStandaloneAuditEvent(
      { companyId: readerB.company.id, actorUserId: readerB.user.id },
      {
        action: 'item.created',
        resourceType: 'item',
        resourceId: 'item-b-secret',
      },
      testDatabaseClient,
    );

    const firstPage = await getAuditEvents(
      auditRequest('?limit=1', readerA.session.token),
    );
    expect(firstPage.status).toBe(200);
    expect(firstPage.headers.get('cache-control')).toBe('private, no-store');
    expect(firstPage.headers.get('vary')).toBe('Cookie');
    const firstBody = (await firstPage.json()) as {
      events: Record<string, unknown>[];
      nextCursor: string;
    };
    expect(firstBody.events).toHaveLength(1);
    expect(firstBody.events[0]).toMatchObject({
      action: 'item.updated',
      resourceId: 'item-a-2',
      outcome: 'succeeded',
    });
    expect(firstBody.events[0]).not.toHaveProperty('companyId');
    expect(firstBody.events[0]).not.toHaveProperty('correlationHash');
    expect(firstBody.events[0]).not.toHaveProperty('idempotencyKeyHash');
    expect(firstBody.events[0]).not.toHaveProperty('subjectHash');

    const secondPage = await getAuditEvents(
      auditRequest(
        `?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
        readerA.session.token,
      ),
    );
    const secondBody = (await secondPage.json()) as {
      events: { resourceId: string }[];
      nextCursor: null;
    };
    expect(secondBody.events.map((event) => event.resourceId)).toEqual([
      'item-a-1',
    ]);
    expect(secondBody.nextCursor).toBeNull();

    const filtered = await getAuditEvents(
      auditRequest(
        '?action=item.created&resourceType=item&outcome=succeeded',
        readerA.session.token,
      ),
    );
    const filteredBody = (await filtered.json()) as {
      events: { resourceId: string }[];
    };
    expect(filteredBody.events.map((event) => event.resourceId)).toEqual([
      'item-a-1',
    ]);
    expect(JSON.stringify(filteredBody)).not.toContain('item-b-secret');
  });

  it('rejects oversized pages, invalid filters, duplicate filters, and malformed cursors', async () => {
    const reader = await createAuditReader('AUDIT-BOUNDS', true);
    for (const query of [
      '?limit=101',
      '?outcome=unknown',
      '?action=unknown.action',
      '?limit=1&limit=2',
      '?cursor=not-a-cursor',
      '?from=2020-01-01&to=2022-01-01',
    ]) {
      const response = await getAuditEvents(
        auditRequest(query, reader.session.token),
      );
      expect(response.status).toBe(422);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  });
});
