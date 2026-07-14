import { ItemType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as chatRequest } from '@/app/api/chat/route';
import {
  GET as getBomsRequest,
} from '@/app/api/inventory/boms/route';
import {
  GET as getItemsRequest,
  PATCH as updateItemRequest,
  POST as createItemRequest,
} from '@/app/api/inventory/items/route';
import {
  POST as postInventoryRequest,
} from '@/app/api/inventory/transactions/route';
import { createAuthSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import {
  activateBomRevision,
  createBom,
  replaceDraftBomComponents,
} from '@/lib/domain/boms';
import { createItem } from '@/lib/domain/items';
import {
  createWarehouse,
  postInventoryTransaction,
  updateSafetyQuantity,
} from '@/lib/domain/inventory';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

type PermissionFlags = {
  canRead?: boolean;
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canAdmin?: boolean;
};

async function createTenantIdentity(
  companyCode: string,
  permissionsByResource: Record<string, PermissionFlags>,
) {
  const company = await createTestCompany(companyCode);
  const user = await testDatabaseClient.user.create({
    data: {
      companyId: company.id,
      email: `user@${companyCode.toLowerCase()}.test`,
      passwordHash: 'test-only',
      name: `${companyCode} User`,
    },
  });
  const role = await testDatabaseClient.role.create({
    data: {
      companyId: company.id,
      code: 'api-role',
      name: 'API Role',
    },
  });
  await testDatabaseClient.userRole.create({
    data: { userId: user.id, roleId: role.id },
  });
  for (const [resourceCode, permissionFlags] of Object.entries(
    permissionsByResource,
  )) {
    const menuItem = await testDatabaseClient.menuItem.create({
      data: {
        companyId: company.id,
        code: resourceCode.replaceAll('.', '-'),
        label: resourceCode,
        href: `/${resourceCode.replaceAll('.', '/')}`,
        resourceCode,
      },
    });
    await testDatabaseClient.rolePermission.create({
      data: {
        roleId: role.id,
        menuItemId: menuItem.id,
        ...permissionFlags,
      },
    });
  }
  const authSession = await createAuthSession(user.id, testDatabaseClient);
  return { company, user, role, authSession };
}

function businessRequest(
  path: string,
  options: {
    method?: string;
    token?: string;
    origin?: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers(options.headers);
  if (options.token) {
    headers.set('Cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  if (options.origin) headers.set('Origin', options.origin);
  if (options.body) headers.set('Content-Type', 'application/json');
  return new Request(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe('U7 business API session authorization and tenant scope', () => {
  beforeEach(async () => {
    vi.stubEnv('UNIPLAN_DEMO_AUTH_ENABLED', 'false');
    await resetTestDatabase();
  });
  afterAll(() => testDatabaseClient.$disconnect());

  it('returns 401 without a real session even when demo auth is enabled', async () => {
    vi.stubEnv('UNIPLAN_DEMO_AUTH_ENABLED', 'true');
    const response = await getItemsRequest(
      businessRequest('/api/inventory/items'),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('allows a valid same-company session and returns only its tenant data', async () => {
    const tenant = await createTenantIdentity('U7-VALID', {
      'inventory.items': { canRead: true },
    });
    await createItem(
      tenant.company.id,
      { code: 'OWN-ITEM', name: 'Own Item', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );

    const response = await getItemsRequest(
      businessRequest('/api/inventory/items', {
        token: tenant.authSession.token,
      }),
    );

    expect(response.status).toBe(200);
    const responseBody = (await response.json()) as {
      items: { code: string; companyId: string }[];
    };
    expect(responseBody.items).toEqual([
      expect.objectContaining({ code: 'OWN-ITEM', companyId: tenant.company.id }),
    ]);
  });

  it('returns 403 when the active session lacks the requested action', async () => {
    const tenant = await createTenantIdentity('U7-FORBIDDEN', {
      'inventory.items': { canRead: true },
    });
    const response = await createItemRequest(
      businessRequest('/api/inventory/items', {
        method: 'POST',
        token: tenant.authSession.token,
        origin: 'http://localhost',
        body: {
          code: 'DENIED',
          name: 'Denied',
          itemType: 'RAW_MATERIAL',
        },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    await expect(testDatabaseClient.item.count()).resolves.toBe(0);
  });

  it('returns 401 for expired, revoked, inactive-user, and inactive-company identities', async () => {
    const tenant = await createTenantIdentity('U7-IDENTITY', {
      'inventory.items': { canRead: true },
    });
    const expectUnauthorized = async (token: string) => {
      const response = await getItemsRequest(
        businessRequest('/api/inventory/items', { token }),
      );
      expect(response.status).toBe(401);
    };

    await testDatabaseClient.authSession.update({
      where: { id: tenant.authSession.sessionId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await expectUnauthorized(tenant.authSession.token);

    const revokedSession = await createAuthSession(
      tenant.user.id,
      testDatabaseClient,
    );
    await testDatabaseClient.authSession.update({
      where: { id: revokedSession.sessionId },
      data: { revokedAt: new Date() },
    });
    await expectUnauthorized(revokedSession.token);

    const inactiveUserSession = await createAuthSession(
      tenant.user.id,
      testDatabaseClient,
    );
    await testDatabaseClient.user.update({
      where: { id: tenant.user.id },
      data: { status: 'inactive' },
    });
    await expectUnauthorized(inactiveUserSession.token);

    await testDatabaseClient.user.update({
      where: { id: tenant.user.id },
      data: { status: 'active' },
    });
    const inactiveCompanySession = await createAuthSession(
      tenant.user.id,
      testDatabaseClient,
    );
    await testDatabaseClient.company.update({
      where: { id: tenant.company.id },
      data: { active: false },
    });
    await expectUnauthorized(inactiveCompanySession.token);
  });

  it('rejects a foreign object ID on read and never returns the foreign BOM', async () => {
    const tenantA = await createTenantIdentity('U7-READ-A', {
      'inventory.boms': { canRead: true },
    });
    const tenantB = await createTenantIdentity('U7-READ-B', {
      'inventory.boms': { canRead: true },
    });
    const foreignMaterial = await createItem(
      tenantB.company.id,
      { code: 'FOREIGN-MAT', name: 'Foreign Material', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const foreignOutput = await createItem(
      tenantB.company.id,
      { code: 'FOREIGN-OUT', name: 'Foreign Output', itemType: ItemType.FINISHED_GOOD },
      testDatabaseClient,
    );
    const foreignBom = await createBom(
      tenantB.company.id,
      { code: 'FOREIGN-BOM', name: 'Foreign BOM', outputItemId: foreignOutput.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      tenantB.company.id,
      foreignBom.versions[0].id,
      [{ itemId: foreignMaterial.id, quantity: '1' }],
      testDatabaseClient,
    );
    const foreignVersion = await activateBomRevision(
      tenantB.company.id,
      foreignBom.versions[0].id,
      testDatabaseClient,
    );

    const response = await getBomsRequest(
      businessRequest(
        `/api/inventory/boms?versionId=${foreignVersion.id}&companyId=${tenantB.company.id}`,
        {
          token: tenantA.authSession.token,
          headers: { 'X-Company-Id': tenantB.company.id },
        },
      ),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rejects a foreign object ID on write without changing either tenant', async () => {
    const tenantA = await createTenantIdentity('U7-WRITE-A', {
      'inventory.items': { canUpdate: true },
    });
    const tenantB = await createTenantIdentity('U7-WRITE-B', {
      'inventory.items': { canUpdate: true },
    });
    const foreignItem = await createItem(
      tenantB.company.id,
      { code: 'FOREIGN', name: 'Original Foreign Name', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );

    const response = await updateItemRequest(
      businessRequest('/api/inventory/items', {
        method: 'PATCH',
        token: tenantA.authSession.token,
        origin: 'http://localhost',
        headers: { 'X-Company-Id': tenantB.company.id },
        body: {
          id: foreignItem.id,
          companyId: tenantB.company.id,
          name: 'Injected Name',
        },
      }),
    );

    expect(response.status).toBe(404);
    await expect(
      testDatabaseClient.item.findUniqueOrThrow({ where: { id: foreignItem.id } }),
    ).resolves.toMatchObject({
      companyId: tenantB.company.id,
      name: 'Original Foreign Name',
    });
  });

  it('ignores creator spoofing and records the session user as inventory actor', async () => {
    const tenantA = await createTenantIdentity('U7-CREATOR-A', {
      'inventory.movements': { canCreate: true },
    });
    const tenantB = await createTenantIdentity('U7-CREATOR-B', {});
    const item = await createItem(
      tenantA.company.id,
      { code: 'RECEIPT-ITEM', name: 'Receipt Item', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const warehouse = await createWarehouse(
      tenantA.company.id,
      { code: 'MAIN', name: 'Main' },
      testDatabaseClient,
    );

    const response = await postInventoryRequest(
      businessRequest('/api/inventory/transactions', {
        method: 'POST',
        token: tenantA.authSession.token,
        origin: 'http://localhost',
        headers: {
          'X-Company-Id': tenantB.company.id,
          'X-User-Id': tenantB.user.id,
        },
        body: {
          companyId: tenantB.company.id,
          userId: tenantB.user.id,
          createdById: tenantB.user.id,
          type: 'RECEIPT',
          idempotencyKey: 'u7-creator-spoof',
          itemId: item.id,
          warehouseId: warehouse.id,
          quantity: '3',
        },
      }),
    );

    expect(response.status).toBe(201);
    await expect(
      testDatabaseClient.inventoryTransaction.findFirstOrThrow({
        where: { idempotencyKey: 'u7-creator-spoof' },
      }),
    ).resolves.toMatchObject({
      companyId: tenantA.company.id,
      createdById: tenantA.user.id,
    });
  });

  it('rejects missing-origin and cross-origin mutation requests before writes', async () => {
    const tenant = await createTenantIdentity('U7-ORIGIN', {
      'inventory.items': { canCreate: true },
    });
    const body = {
      code: 'ORIGIN-DENIED',
      name: 'Origin Denied',
      itemType: 'RAW_MATERIAL',
    };
    const [missingOriginResponse, crossOriginResponse] = await Promise.all([
      createItemRequest(
        businessRequest('/api/inventory/items', {
          method: 'POST',
          token: tenant.authSession.token,
          body,
        }),
      ),
      createItemRequest(
        businessRequest('/api/inventory/items', {
          method: 'POST',
          token: tenant.authSession.token,
          origin: 'https://attacker.example',
          body,
        }),
      ),
    ]);

    expect(missingOriginResponse.status).toBe(403);
    expect(crossOriginResponse.status).toBe(403);
    await expect(testDatabaseClient.item.count()).resolves.toBe(0);
  });

  it('keeps parallel tenant reads isolated by each request session', async () => {
    const tenantA = await createTenantIdentity('U7-PARALLEL-A', {
      'inventory.items': { canRead: true },
    });
    const tenantB = await createTenantIdentity('U7-PARALLEL-B', {
      'inventory.items': { canRead: true },
    });
    await Promise.all([
      createItem(
        tenantA.company.id,
        { code: 'ONLY-A', name: 'Only A', itemType: ItemType.RAW_MATERIAL },
        testDatabaseClient,
      ),
      createItem(
        tenantB.company.id,
        { code: 'ONLY-B', name: 'Only B', itemType: ItemType.RAW_MATERIAL },
        testDatabaseClient,
      ),
    ]);

    const [responseA, responseB] = await Promise.all([
      getItemsRequest(
        businessRequest('/api/inventory/items', {
          token: tenantA.authSession.token,
        }),
      ),
      getItemsRequest(
        businessRequest('/api/inventory/items', {
          token: tenantB.authSession.token,
        }),
      ),
    ]);
    const [bodyA, bodyB] = (await Promise.all([
      responseA.json(),
      responseB.json(),
    ])) as [{ items: { code: string }[] }, { items: { code: string }[] }];

    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(bodyA.items.map((item) => item.code)).toEqual(['ONLY-A']);
    expect(bodyB.items.map((item) => item.code)).toEqual(['ONLY-B']);
  });

  it('runs AI templates only against the session company', async () => {
    const tenantA = await createTenantIdentity('U7-AI-A', {
      'dashboard.analytics': { canRead: true },
    });
    const tenantB = await createTenantIdentity('U7-AI-B', {
      'dashboard.analytics': { canRead: true },
    });
    const [itemA, itemB, warehouseA, warehouseB] = await Promise.all([
      createItem(
        tenantA.company.id,
        { code: 'AI-A', name: 'AI Tenant A Item', itemType: ItemType.RAW_MATERIAL },
        testDatabaseClient,
      ),
      createItem(
        tenantB.company.id,
        { code: 'AI-B', name: 'AI Tenant B Item', itemType: ItemType.RAW_MATERIAL },
        testDatabaseClient,
      ),
      createWarehouse(
        tenantA.company.id,
        { code: 'AI-WH-A', name: 'AI Warehouse A' },
        testDatabaseClient,
      ),
      createWarehouse(
        tenantB.company.id,
        { code: 'AI-WH-B', name: 'AI Warehouse B' },
        testDatabaseClient,
      ),
    ]);
    await Promise.all([
      postInventoryTransaction(
        tenantA.company.id,
        {
          type: 'RECEIPT',
          idempotencyKey: 'u7-ai-a-opening',
          createdById: tenantA.user.id,
          lines: [{ itemId: itemA.id, warehouseId: warehouseA.id, quantity: 1 }],
        },
        { db: testDatabaseClient },
      ),
      postInventoryTransaction(
        tenantB.company.id,
        {
          type: 'RECEIPT',
          idempotencyKey: 'u7-ai-b-opening',
          createdById: tenantB.user.id,
          lines: [{ itemId: itemB.id, warehouseId: warehouseB.id, quantity: 1 }],
        },
        { db: testDatabaseClient },
      ),
    ]);
    const [balanceA, balanceB] = await Promise.all([
      testDatabaseClient.inventoryBalance.findUniqueOrThrow({
        where: {
          companyId_itemId_warehouseId: {
            companyId: tenantA.company.id,
            itemId: itemA.id,
            warehouseId: warehouseA.id,
          },
        },
      }),
      testDatabaseClient.inventoryBalance.findUniqueOrThrow({
        where: {
          companyId_itemId_warehouseId: {
            companyId: tenantB.company.id,
            itemId: itemB.id,
            warehouseId: warehouseB.id,
          },
        },
      }),
    ]);
    await Promise.all([
      updateSafetyQuantity(
        tenantA.company.id,
        balanceA.id,
        5,
        testDatabaseClient,
      ),
      updateSafetyQuantity(
        tenantB.company.id,
        balanceB.id,
        5,
        testDatabaseClient,
      ),
    ]);

    const response = await chatRequest(
      businessRequest('/api/chat', {
        method: 'POST',
        token: tenantA.authSession.token,
        origin: 'http://localhost',
        headers: { 'X-Company-Id': tenantB.company.id },
        body: {
          message: '재고 부족한 품목',
          companyId: tenantB.company.id,
          userId: tenantB.user.id,
        },
      }),
    );
    const responseBody = (await response.json()) as {
      grid: { rows: Record<string, string | number>[] };
    };

    expect(response.status).toBe(200);
    expect(responseBody.grid.rows).toEqual([
      expect.objectContaining({ 품목: 'AI Tenant A Item' }),
    ]);
    expect(JSON.stringify(responseBody)).not.toContain('AI Tenant B Item');
  });
});
