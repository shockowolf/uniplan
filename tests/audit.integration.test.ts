import { ItemType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  recordStandaloneAuditEvent,
  type AuditAction,
} from '@/lib/audit/service.server';
import {
  activateBom,
  activateBomRevision,
  createBom,
  createDraftBomRevision,
  deactivateBom,
  replaceDraftBomComponents,
  retireBomRevision,
  updateBom,
} from '@/lib/domain/boms';
import {
  activateItem,
  activateItemCategory,
  createItem,
  createItemCategory,
  deactivateItem,
  deactivateItemCategory,
  updateItem,
  updateItemCategory,
} from '@/lib/domain/items';
import {
  activateNavigationMenuItem,
  createNavigationMenuItem,
  deactivateNavigationMenuItem,
  updateNavigationMenuItem,
} from '@/lib/domain/navigation-settings';
import {
  activateWarehouse,
  createWarehouse,
  deactivateWarehouse,
  postInventoryTransaction,
  updateSafetyQuantity,
  updateWarehouse,
} from '@/lib/domain/inventory';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

describe('transactional append-only audit log', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  async function expectOneSuccess<T>(
    companyId: string,
    action: AuditAction,
    operation: () => Promise<T>,
  ) {
    const before = await testDatabaseClient.auditEvent.count({
      where: { companyId },
    });
    const result = await operation();
    const events = await testDatabaseClient.auditEvent.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(events).toHaveLength(before + 1);
    expect(events[0]).toMatchObject({ action, outcome: 'SUCCEEDED' });
    return result;
  }

  it('emits exactly one actor-bound success event for every critical mutation family', async () => {
    const company = await createTestCompany('AUDIT-COVERAGE');
    const actor = company.auditActor;

    const category = await expectOneSuccess(
      company.id,
      'item_category.created',
      () =>
        createItemCategory(
          company.id,
          { code: 'CAT', name: 'Category' },
          actor,
          testDatabaseClient,
        ),
    );
    await expectOneSuccess(company.id, 'item_category.updated', () =>
      updateItemCategory(
        company.id,
        category.id,
        { name: 'Category Updated' },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'item_category.deactivated', () =>
      deactivateItemCategory(
        company.id,
        category.id,
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'item_category.activated', () =>
      activateItemCategory(
        company.id,
        category.id,
        actor,
        testDatabaseClient,
      ),
    );

    const mutableItem = await expectOneSuccess(company.id, 'item.created', () =>
      createItem(
        company.id,
        {
          code: 'MUTABLE',
          name: 'Mutable',
          itemType: ItemType.CONSUMABLE,
          categoryId: category.id,
        },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'item.updated', () =>
      updateItem(
        company.id,
        mutableItem.id,
        { name: 'Mutable Updated' },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'item.deactivated', () =>
      deactivateItem(company.id, mutableItem.id, actor, testDatabaseClient),
    );
    await expectOneSuccess(company.id, 'item.activated', () =>
      activateItem(company.id, mutableItem.id, actor, testDatabaseClient),
    );

    const warehouse = await expectOneSuccess(
      company.id,
      'warehouse.created',
      () =>
        createWarehouse(
          company.id,
          { code: 'MAIN', name: 'Main' },
          actor,
          testDatabaseClient,
        ),
    );
    await expectOneSuccess(company.id, 'warehouse.updated', () =>
      updateWarehouse(
        company.id,
        warehouse.id,
        { name: 'Main Updated' },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'warehouse.deactivated', () =>
      deactivateWarehouse(company.id, warehouse.id, actor, testDatabaseClient),
    );
    await expectOneSuccess(company.id, 'warehouse.activated', () =>
      activateWarehouse(company.id, warehouse.id, actor, testDatabaseClient),
    );

    const component = await createItem(
      company.id,
      { code: 'COMP', name: 'Component', itemType: ItemType.RAW_MATERIAL },
      actor,
      testDatabaseClient,
    );
    const output = await createItem(
      company.id,
      { code: 'OUTPUT', name: 'Output', itemType: ItemType.FINISHED_GOOD },
      actor,
      testDatabaseClient,
    );
    const bom = await expectOneSuccess(company.id, 'bom.created', () =>
      createBom(
        company.id,
        { code: 'BOM-OUTPUT', name: 'Output BOM', outputItemId: output.id },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'bom.updated', () =>
      updateBom(
        company.id,
        bom.id,
        { name: 'Output BOM Updated' },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'bom_revision.components_replaced', () =>
      replaceDraftBomComponents(
        company.id,
        bom.versions[0].id,
        [{ itemId: component.id, quantity: '2' }],
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'bom_revision.activated', () =>
      activateBomRevision(
        company.id,
        bom.versions[0].id,
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'bom_revision.retired', () =>
      retireBomRevision(
        company.id,
        bom.versions[0].id,
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'bom.deactivated', () =>
      deactivateBom(company.id, bom.id, actor, testDatabaseClient),
    );
    await expectOneSuccess(company.id, 'bom.activated', () =>
      activateBom(company.id, bom.id, actor, testDatabaseClient),
    );
    const secondRevision = await expectOneSuccess(
      company.id,
      'bom_revision.created',
      () =>
        createDraftBomRevision(
          company.id,
          bom.id,
          actor,
          null,
          testDatabaseClient,
        ),
    );
    await replaceDraftBomComponents(
      company.id,
      secondRevision.id,
      [{ itemId: component.id, quantity: '2' }],
      actor,
      testDatabaseClient,
    );
    await activateBomRevision(
      company.id,
      secondRevision.id,
      actor,
      testDatabaseClient,
    );

    const receipt = await expectOneSuccess(
      company.id,
      'inventory.transaction_posted',
      () =>
        postInventoryTransaction(
          company.id,
          {
            type: 'RECEIPT',
            idempotencyKey: 'coverage-receipt',
            lines: [
              { itemId: component.id, warehouseId: warehouse.id, quantity: '20' },
            ],
          },
          actor,
          { db: testDatabaseClient },
        ),
    );
    const balance = await testDatabaseClient.inventoryBalance.findUniqueOrThrow({
      where: {
        companyId_itemId_warehouseId: {
          companyId: company.id,
          itemId: component.id,
          warehouseId: warehouse.id,
        },
      },
    });
    await expectOneSuccess(
      company.id,
      'inventory.safety_quantity_updated',
      () =>
        updateSafetyQuantity(
          company.id,
          balance.id,
          '3',
          actor,
          testDatabaseClient,
        ),
    );
    const production = await expectOneSuccess(
      company.id,
      'inventory.production_posted',
      () =>
      postInventoryTransaction(
        company.id,
        {
          type: 'PRODUCTION',
          idempotencyKey: 'coverage-production',
          bomVersionId: secondRevision.id,
          quantity: '2',
          componentWarehouseId: warehouse.id,
          outputWarehouseId: warehouse.id,
        },
        actor,
        { db: testDatabaseClient },
      ),
    );
    await expectOneSuccess(company.id, 'inventory.transaction_reversed', () =>
      postInventoryTransaction(
        company.id,
        {
          type: 'REVERSAL',
          idempotencyKey: 'coverage-reversal',
          originalTransactionId: production.id,
        },
        actor,
        { db: testDatabaseClient },
      ),
    );

    const navigationAdminRole = await testDatabaseClient.role.create({
      data: { companyId: company.id, code: 'nav-admin', name: 'Nav Admin' },
    });
    const navigationPermissionItem = await testDatabaseClient.menuItem.create({
      data: {
        companyId: company.id,
        code: 'settings-navigation',
        label: 'Navigation',
        href: '/settings/navigation',
        resourceCode: 'settings.navigation',
      },
    });
    await testDatabaseClient.userRole.create({
      data: {
        companyId: company.id,
        userId: actor.actorUserId,
        roleId: navigationAdminRole.id,
      },
    });
    await testDatabaseClient.rolePermission.create({
      data: {
        companyId: company.id,
        roleId: navigationAdminRole.id,
        menuItemId: navigationPermissionItem.id,
        canAdmin: true,
      },
    });
    const navigation = await expectOneSuccess(
      company.id,
      'navigation.created',
      () =>
        createNavigationMenuItem(
          company.id,
          actor,
          {
            code: 'audit-nav',
            label: 'Audit Nav',
            href: '/system',
            resourceCode: 'system.audit-nav',
          },
          testDatabaseClient,
        ),
    );
    await expectOneSuccess(company.id, 'navigation.updated', () =>
      updateNavigationMenuItem(
        company.id,
        navigation.id,
        { label: 'Audit Nav Updated' },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'navigation.reparented', () =>
      updateNavigationMenuItem(
        company.id,
        navigation.id,
        { parentId: navigationPermissionItem.id },
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'navigation.deactivated', () =>
      deactivateNavigationMenuItem(
        company.id,
        navigation.id,
        actor,
        testDatabaseClient,
      ),
    );
    await expectOneSuccess(company.id, 'navigation.activated', () =>
      activateNavigationMenuItem(
        company.id,
        navigation.id,
        actor,
        testDatabaseClient,
      ),
    );

    expect(
      await testDatabaseClient.auditEvent.count({
        where: { companyId: company.id, actorUserId: actor.actorUserId },
      }),
    ).toBe(await testDatabaseClient.auditEvent.count({ where: { companyId: company.id } }));
  });

  it('rejects UPDATE/DELETE and cross-tenant actors at the database boundary', async () => {
    const companyA = await createTestCompany('AUDIT-APPEND-A');
    const companyB = await createTestCompany('AUDIT-APPEND-B');
    const event = await recordStandaloneAuditEvent(
      companyA.auditActor,
      {
        action: 'item.created',
        resourceType: 'item',
        resourceId: 'opaque-item',
      },
      testDatabaseClient,
    );

    await expect(
      testDatabaseClient.auditEvent.update({
        where: { id: event.id },
        data: { action: 'item.updated' },
      }),
    ).rejects.toBeTruthy();
    await expect(
      testDatabaseClient.auditEvent.delete({ where: { id: event.id } }),
    ).rejects.toBeTruthy();
    await expect(
      recordStandaloneAuditEvent(
        { companyId: companyA.id, actorUserId: companyB.auditActor.actorUserId },
        {
          action: 'item.created',
          resourceType: 'item',
          resourceId: 'cross-tenant',
        },
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
  });

  it('rolls back business state on audit failure and emits no success for business failure', async () => {
    const company = await createTestCompany('AUDIT-ROLLBACK');
    const before = await testDatabaseClient.auditEvent.count();
    await expect(
      createItem(
        company.id,
        { code: 'ROLLBACK', name: 'Rollback', itemType: ItemType.COMPONENT },
        company.auditActor,
        testDatabaseClient,
        {
          auditHooks: {
            beforeInsert: async () => {
              throw new Error('injected audit failure');
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'AUDIT_WRITE_FAILED' });
    await expect(
      testDatabaseClient.item.count({ where: { companyId: company.id } }),
    ).resolves.toBe(0);
    await expect(testDatabaseClient.auditEvent.count()).resolves.toBe(before);

    await expect(
      createItem(
        company.id,
        {
          code: 'INVALID',
          name: 'Invalid',
          itemType: ItemType.SERVICE,
          trackInventory: true,
        },
        company.auditActor,
        testDatabaseClient,
      ),
    ).rejects.toMatchObject({ code: 'SERVICE_INVENTORY_NOT_ALLOWED' });
    await expect(testDatabaseClient.auditEvent.count()).resolves.toBe(before);
  });

  it('does not duplicate events for true-parallel replay or Serializable retry', async () => {
    const company = await createTestCompany('AUDIT-RETRY');
    const item = await createItem(
      company.id,
      { code: 'ITEM', name: 'Item', itemType: ItemType.RAW_MATERIAL },
      company.auditActor,
      testDatabaseClient,
    );
    const warehouse = await createWarehouse(
      company.id,
      { code: 'MAIN', name: 'Main' },
      company.auditActor,
      testDatabaseClient,
    );
    const posting = () =>
      postInventoryTransaction(
        company.id,
        {
          type: 'RECEIPT',
          idempotencyKey: 'parallel-audit',
          lines: [{ itemId: item.id, warehouseId: warehouse.id, quantity: '2' }],
        },
        company.auditActor,
        { db: testDatabaseClient },
      );
    const [first, second] = await Promise.all([posting(), posting()]);
    expect(first.id).toBe(second.id);
    await expect(
      testDatabaseClient.auditEvent.count({
        where: {
          companyId: company.id,
          action: 'inventory.transaction_posted',
          resourceId: first.id,
        },
      }),
    ).resolves.toBe(1);

    let attempts = 0;
    const retriedItem = await createItem(
      company.id,
      { code: 'RETRIED', name: 'Retried', itemType: ItemType.COMPONENT },
      company.auditActor,
      testDatabaseClient,
      {
        maxAttempts: 2,
        hooks: {
          afterLock: async () => {
            attempts += 1;
            if (attempts === 1) throw { code: 'P2034' };
          },
        },
      },
    );
    expect(attempts).toBe(2);
    await expect(
      testDatabaseClient.auditEvent.count({
        where: {
          companyId: company.id,
          action: 'item.created',
          resourceId: retriedItem.id,
        },
      }),
    ).resolves.toBe(1);
  });
});
