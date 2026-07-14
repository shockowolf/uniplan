import { ItemType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as createItemRequest } from '@/app/api/inventory/items/route';
import { PATCH as updateStockRequest } from '@/app/api/inventory/stock/route';
import { POST as postInventoryRequest } from '@/app/api/inventory/transactions/route';
import { POST as createNavigationRequest } from '@/app/api/settings/navigation/route';
import { createAuthSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { createItem } from '@/lib/domain/items';
import { createWarehouse } from '@/lib/domain/inventory';
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

async function createSessionAuthorization(
  permissionsByResource: Record<string, PermissionFlags>,
) {
  const company = await testDatabaseClient.company.create({
    data: {
      code: 'TASK5-DEMO',
      name: 'Task 5 Demo Company',
    },
  });
  const user = await testDatabaseClient.user.create({
    data: {
      companyId: company.id,
      email: 'task5-admin@uniplan.test',
      passwordHash: 'test',
      name: 'Task 5 Administrator',
    },
  });
  const administratorRole = await testDatabaseClient.role.create({
    data: {
      companyId: company.id,
      code: 'task5-admin',
      name: 'Task 5 Administrator',
    },
  });
  await testDatabaseClient.userRole.create({
    data: {
      companyId: company.id,
      userId: user.id,
      roleId: administratorRole.id,
    },
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
        companyId: company.id,
        roleId: administratorRole.id,
        menuItemId: menuItem.id,
        ...permissionFlags,
      },
    });
  }
  const authSession = await createAuthSession(user.id, testDatabaseClient);
  return { company, user, token: authSession.token };
}

function jsonRequest(
  url: string,
  body: Record<string, unknown>,
  token: string,
  method = 'POST',
) {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      Origin: 'http://localhost',
    },
    body: JSON.stringify(body),
  });
}

describe('Task 5 native API boundaries', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  it('creates items only in the server-derived session company', async () => {
    const { company, token } = await createSessionAuthorization({
      'inventory.items': { canCreate: true },
    });
    const foreignCompany = await createTestCompany('TASK5-FOREIGN');
    const response = await createItemRequest(
      jsonRequest(
        'http://localhost/api/inventory/items',
        {
          companyId: foreignCompany.id,
          userId: 'untrusted-user',
          code: 'NATIVE-ITEM',
          name: 'Native Item',
          itemType: 'RAW_MATERIAL',
        },
        token,
      ),
    );
    expect(response.status).toBe(201);
    await expect(
      testDatabaseClient.item.findFirstOrThrow({
        where: { code: 'NATIVE-ITEM' },
      }),
    ).resolves.toMatchObject({ companyId: company.id });
  });

  it('denies an API request when the shared permission lookup has no grant', async () => {
    const { token } = await createSessionAuthorization({});
    const response = await createItemRequest(
      jsonRequest(
        'http://localhost/api/inventory/items',
        {
          code: 'DENIED',
          name: 'Denied',
          itemType: 'RAW_MATERIAL',
        },
        token,
      ),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    await expect(testDatabaseClient.item.count()).resolves.toBe(0);
  });

  it('returns field-level validation errors for malformed numeric input', async () => {
    const { token } = await createSessionAuthorization({
      'inventory.items': { canCreate: true },
    });
    const response = await createItemRequest(
      jsonRequest(
        'http://localhost/api/inventory/items',
        {
          code: 'BAD-MONEY',
          name: 'Bad Money',
          itemType: 'RAW_MATERIAL',
          standardPrice: 'not-a-number',
        },
        token,
      ),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        fieldErrors: { standardPrice: expect.any(String) },
      },
    });
  });

  it('posts inventory with server-derived creator and never accepts direct on-hand quantity', async () => {
    const { company, user, token } = await createSessionAuthorization({
      'inventory.movements': { canCreate: true },
      'inventory.stock': { canUpdate: true },
    });
    const foreignCompany = await createTestCompany('TASK5-STOCK-FOREIGN');
    const foreignUser = await testDatabaseClient.user.create({
      data: {
        companyId: foreignCompany.id,
        email: 'foreign@example.test',
        passwordHash: 'test',
        name: 'Foreign User',
      },
    });
    const inventoryItem = await createItem(
      company.id,
      {
        code: 'STOCK-ITEM',
        name: 'Stock Item',
        itemType: ItemType.RAW_MATERIAL,
      },
      { companyId: company.id, actorUserId: user.id },
      testDatabaseClient,
    );
    const warehouse = await createWarehouse(
      company.id,
      { code: 'MAIN', name: 'Main' },
      { companyId: company.id, actorUserId: user.id },
      testDatabaseClient,
    );
    const postingResponse = await postInventoryRequest(
      jsonRequest(
        'http://localhost/api/inventory/transactions',
        {
          companyId: foreignCompany.id,
          userId: foreignUser.id,
          createdById: foreignUser.id,
          type: 'RECEIPT',
          idempotencyKey: 'task5-api-receipt',
          itemId: inventoryItem.id,
          warehouseId: warehouse.id,
          quantity: '5',
        },
        token,
      ),
    );
    expect(postingResponse.status).toBe(201);
    const inventoryTransaction =
      await testDatabaseClient.inventoryTransaction.findFirstOrThrow({
        where: { idempotencyKey: 'task5-api-receipt' },
      });
    expect(inventoryTransaction).toMatchObject({
      companyId: company.id,
      createdById: user.id,
    });
    const inventoryBalance =
      await testDatabaseClient.inventoryBalance.findFirstOrThrow({
        where: { companyId: company.id },
      });
    const safetyUpdateResponse = await updateStockRequest(
      jsonRequest(
        'http://localhost/api/inventory/stock',
        {
          id: inventoryBalance.id,
          quantity: '999',
          safetyQuantity: '2',
          companyId: foreignCompany.id,
        },
        token,
        'PATCH',
      ),
    );
    expect(safetyUpdateResponse.status).toBe(200);
    const updatedBalance =
      await testDatabaseClient.inventoryBalance.findUniqueOrThrow({
        where: { id: inventoryBalance.id },
      });
    expect(updatedBalance.quantity.toFixed(6)).toBe('5.000000');
    expect(updatedBalance.safetyQuantity.toFixed(6)).toBe('2.000000');
  });

  it('rejects external navigation paths through the protected settings API', async () => {
    const { token } = await createSessionAuthorization({
      'settings.navigation': { canAdmin: true },
    });
    const response = await createNavigationRequest(
      jsonRequest(
        'http://localhost/api/settings/navigation',
        {
          code: 'outside',
          label: '외부 메뉴',
          href: 'https://outside.example',
          resourceCode: 'settings.outside',
        },
        token,
      ),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'INVALID_NAVIGATION_HREF',
        fieldErrors: { href: expect.any(String) },
      },
    });
  });
});
