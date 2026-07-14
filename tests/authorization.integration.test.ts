import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getAuthorizedMenuTree } from '@/lib/navigation';
import { hasPermission } from '@/lib/auth/permissions';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

describe('tenant-scoped authorization', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  async function createAuthorizationTestContext() {
    const company = await createTestCompany('AUTH-A');
    const otherCompany = await createTestCompany('AUTH-B');
    const authorizedUser = await testDatabaseClient.user.create({
      data: {
        companyId: company.id,
        email: 'user@a.test',
        passwordHash: 'test',
        name: 'User',
      },
    });
    const readerRole = await testDatabaseClient.role.create({
      data: { companyId: company.id, code: 'reader', name: 'Reader' },
    });
    const creatorRole = await testDatabaseClient.role.create({
      data: { companyId: company.id, code: 'writer', name: 'Writer' },
    });
    const inventoryItemsMenu = await testDatabaseClient.menuItem.create({
      data: {
        companyId: company.id,
        code: 'items',
        label: 'Items',
        href: '/inventory/items',
        resourceCode: 'inventory.items',
      },
    });
    await testDatabaseClient.userRole.createMany({
      data: [
        {
          companyId: company.id,
          userId: authorizedUser.id,
          roleId: readerRole.id,
        },
        {
          companyId: company.id,
          userId: authorizedUser.id,
          roleId: creatorRole.id,
        },
      ],
    });
    await testDatabaseClient.rolePermission.createMany({
      data: [
        {
          companyId: company.id,
          roleId: readerRole.id,
          menuItemId: inventoryItemsMenu.id,
          canRead: true,
        },
        {
          companyId: company.id,
          roleId: creatorRole.id,
          menuItemId: inventoryItemsMenu.id,
          canCreate: true,
        },
      ],
    });
    return { company, otherCompany, authorizedUser, inventoryItemsMenu };
  }

  it('denies missing permissions and unions permissions across roles', async () => {
    const { company, authorizedUser } = await createAuthorizationTestContext();
    await expect(
      hasPermission(
        {
          companyId: company.id,
          userId: authorizedUser.id,
          resourceCode: 'inventory.items',
          action: 'read',
        },
        testDatabaseClient,
      ),
    ).resolves.toBe(true);
    await expect(
      hasPermission(
        {
          companyId: company.id,
          userId: authorizedUser.id,
          resourceCode: 'inventory.items',
          action: 'create',
        },
        testDatabaseClient,
      ),
    ).resolves.toBe(true);
    await expect(
      hasPermission(
        {
          companyId: company.id,
          userId: authorizedUser.id,
          resourceCode: 'inventory.items',
          action: 'delete',
        },
        testDatabaseClient,
      ),
    ).resolves.toBe(false);
    await expect(
      hasPermission(
        {
          companyId: company.id,
          userId: authorizedUser.id,
          resourceCode: 'missing',
          action: 'read',
        },
        testDatabaseClient,
      ),
    ).resolves.toBe(false);
  });

  it('isolates permissions and menu trees by company', async () => {
    const { company, otherCompany, authorizedUser } =
      await createAuthorizationTestContext();
    await expect(
      hasPermission(
        {
          companyId: otherCompany.id,
          userId: authorizedUser.id,
          resourceCode: 'inventory.items',
          action: 'read',
        },
        testDatabaseClient,
      ),
    ).resolves.toBe(false);
    await expect(
      getAuthorizedMenuTree(company.id, authorizedUser.id, testDatabaseClient),
    ).resolves.toHaveLength(1);
    await expect(
      getAuthorizedMenuTree(
        otherCompany.id,
        authorizedUser.id,
        testDatabaseClient,
      ),
    ).resolves.toEqual([]);
  });
});
