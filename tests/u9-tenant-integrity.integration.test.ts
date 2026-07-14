import { ItemType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertDisposableTestSchema,
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

function containsPostgresCode(error: unknown, targetCode: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record.code === targetCode ||
    record.sqlState === targetCode ||
    containsPostgresCode(record.meta, targetCode) ||
    containsPostgresCode(record.cause, targetCode)
  );
}

async function expectForeignKeyRejection(operation: () => Promise<unknown>) {
  await assertDisposableTestSchema();
  try {
    await operation();
    throw new Error('Expected PostgreSQL to reject a cross-company relation.');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'Expected PostgreSQL to reject a cross-company relation.'
    ) {
      throw error;
    }
    expect(
      containsPostgresCode(error, '23503') ||
        containsPostgresCode(error, 'P2003') ||
        containsPostgresCode(error, 'P2010'),
    ).toBe(true);
  }
}

describe('U9 PostgreSQL tenant relational integrity', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  it('rejects representative cross-company foreign keys in direct SQL', async () => {
    const companyA = await createTestCompany('U9-FK-A');
    const companyB = await createTestCompany('U9-FK-B');
    const [domainA, domainB] = await Promise.all([
      testDatabaseClient.domain.create({
        data: {
          companyId: companyA.id,
          code: 'ERP',
          name: 'ERP A',
          domainName: 'a.test',
        },
      }),
      testDatabaseClient.domain.create({
        data: {
          companyId: companyB.id,
          code: 'ERP',
          name: 'ERP B',
          domainName: 'b.test',
        },
      }),
    ]);
    const [userA, roleA, roleB, menuA, menuB, categoryA, categoryB, itemB] =
      await Promise.all([
        testDatabaseClient.user.create({
          data: {
            companyId: companyA.id,
            domainId: domainA.id,
            email: 'a@u9.test',
            passwordHash: 'test',
            name: 'A',
          },
        }),
        testDatabaseClient.role.create({
          data: { companyId: companyA.id, code: 'role-a', name: 'Role A' },
        }),
        testDatabaseClient.role.create({
          data: { companyId: companyB.id, code: 'role-b', name: 'Role B' },
        }),
        testDatabaseClient.menuItem.create({
          data: {
            companyId: companyA.id,
            code: 'menu-a',
            label: 'Menu A',
            href: '/a',
            resourceCode: 'u9.a',
          },
        }),
        testDatabaseClient.menuItem.create({
          data: {
            companyId: companyB.id,
            code: 'menu-b',
            label: 'Menu B',
            href: '/b',
            resourceCode: 'u9.b',
          },
        }),
        testDatabaseClient.itemCategory.create({
          data: { companyId: companyA.id, code: 'cat-a', name: 'Category A' },
        }),
        testDatabaseClient.itemCategory.create({
          data: { companyId: companyB.id, code: 'cat-b', name: 'Category B' },
        }),
        testDatabaseClient.item.create({
          data: {
            companyId: companyB.id,
            code: 'item-b',
            name: 'Item B',
            itemType: ItemType.RAW_MATERIAL,
          },
        }),
      ]);
    const [warehouseA, customerB] = await Promise.all([
      testDatabaseClient.warehouse.create({
        data: { companyId: companyA.id, code: 'wh-a', name: 'Warehouse A' },
      }),
      testDatabaseClient.customer.create({
        data: {
          companyId: companyB.id,
          code: 'customer-b',
          name: 'Customer B',
        },
      }),
    ]);

    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        INSERT INTO "users" ("id", "companyId", "domainId", "email", "passwordHash", "name", "updatedAt")
        VALUES ('cross-user', ${companyA.id}, ${domainB.id}, 'cross@u9.test', 'test', 'Cross', now())
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        INSERT INTO "user_roles" ("id", "companyId", "userId", "roleId")
        VALUES ('cross-user-role', ${companyA.id}, ${userA.id}, ${roleB.id})
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        INSERT INTO "role_permissions" ("id", "companyId", "roleId", "menuItemId", "updatedAt")
        VALUES ('cross-permission', ${companyA.id}, ${roleA.id}, ${menuB.id}, now())
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        UPDATE "menu_items" SET "parentId" = ${menuB.id} WHERE "id" = ${menuA.id}
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        UPDATE "item_categories" SET "parentId" = ${categoryB.id} WHERE "id" = ${categoryA.id}
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        INSERT INTO "boms" ("id", "companyId", "outputItemId", "code", "name", "updatedAt")
        VALUES ('cross-bom', ${companyA.id}, ${itemB.id}, 'cross-bom', 'Cross BOM', now())
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        INSERT INTO "inventory_balances" ("id", "companyId", "itemId", "warehouseId", "updatedAt")
        VALUES ('cross-balance', ${companyA.id}, ${itemB.id}, ${warehouseA.id}, now())
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        INSERT INTO "sales_orders" ("id", "companyId", "orderNo", "customerId", "orderDate", "updatedAt")
        VALUES ('cross-order', ${companyA.id}, 'cross-order', ${customerB.id}, now(), now())
      `,
    );
    await expectForeignKeyRejection(
      () =>
        testDatabaseClient.$executeRaw`
        INSERT INTO "service_cases" ("id", "companyId", "itemId", "status", "symptom", "receivedAt")
        VALUES ('cross-case', ${companyA.id}, ${itemB.id}, 'received', 'Cross', now())
      `,
    );
  });
});
