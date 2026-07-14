import { BomVersionStatus, ItemType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activateBomRevision,
  createBom,
  createDraftBomRevision,
  replaceDraftBomComponents,
} from '@/lib/domain/boms';
import {
  createItem,
  createItemCategory,
  deactivateItem,
  deactivateItemCategory,
  updateItem,
  updateItemCategory,
} from '@/lib/domain/items';
import {
  deactivateNavigationMenuItem,
  updateNavigationMenuItem,
} from '@/lib/domain/navigation-settings';
import {
  createWarehouse,
  deactivateWarehouse,
  postInventoryTransaction,
} from '@/lib/domain/inventory';
import { deferred, remainsBlocked } from './helpers/barrier';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

describe('U9 forced domain interleavings', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  it('serializes posting against item/warehouse deactivation and semantic updates', async () => {
    const company = await createTestCompany('U9-POST-MASTER');
    const item = await createItem(
      company.id,
      { code: 'ITEM', name: 'Item', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const warehouse = await createWarehouse(
      company.id,
      { code: 'MAIN', name: 'Main' },
      testDatabaseClient,
    );
    const postingLocked = deferred();
    const releasePosting = deferred();
    const posting = postInventoryTransaction(
      company.id,
      {
        type: 'RECEIPT',
        idempotencyKey: 'forced-posting',
        lines: [{ itemId: item.id, warehouseId: warehouse.id, quantity: '1' }],
      },
      {
        db: testDatabaseClient,
        hooks: {
          afterLock: async () => {
            postingLocked.resolve();
            await releasePosting.promise;
          },
        },
      },
    );
    await postingLocked.promise;

    const itemDeactivationLocked = deferred();
    const itemDeactivation = deactivateItem(
      company.id,
      item.id,
      testDatabaseClient,
      { hooks: { afterLock: async () => itemDeactivationLocked.resolve() } },
    );
    const warehouseDeactivation = deactivateWarehouse(
      company.id,
      warehouse.id,
      testDatabaseClient,
    );
    const semanticUpdate = updateItem(
      company.id,
      item.id,
      { trackInventory: false },
      testDatabaseClient,
    );
    const itemDeactivationResult = expect(
      itemDeactivation,
    ).rejects.toMatchObject({ code: 'ITEM_HAS_STOCK' });
    const warehouseDeactivationResult = expect(
      warehouseDeactivation,
    ).rejects.toMatchObject({ code: 'WAREHOUSE_HAS_STOCK' });
    const semanticUpdateResult = expect(semanticUpdate).rejects.toMatchObject({
      code: 'ITEM_SEMANTICS_IN_USE',
    });
    await expect(remainsBlocked(itemDeactivationLocked.promise)).resolves.toBe(
      true,
    );

    releasePosting.resolve();
    await expect(posting).resolves.toMatchObject({
      idempotencyKey: 'forced-posting',
    });
    await itemDeactivationResult;
    await warehouseDeactivationResult;
    await semanticUpdateResult;
  });

  it('prevents forced category and navigation A-to-B/B-to-A cycles', async () => {
    const company = await createTestCompany('U9-TREES');
    const [categoryA, categoryB] = await Promise.all([
      createItemCategory(
        company.id,
        { code: 'A', name: 'A' },
        testDatabaseClient,
      ),
      createItemCategory(
        company.id,
        { code: 'B', name: 'B' },
        testDatabaseClient,
      ),
    ]);
    const firstCategoryLocked = deferred();
    const releaseCategory = deferred();
    const firstCategoryMove = updateItemCategory(
      company.id,
      categoryA.id,
      { parentId: categoryB.id },
      testDatabaseClient,
      {
        hooks: {
          afterLock: async () => {
            firstCategoryLocked.resolve();
            await releaseCategory.promise;
          },
        },
      },
    );
    await firstCategoryLocked.promise;
    const secondCategoryLocked = deferred();
    const secondCategoryMove = updateItemCategory(
      company.id,
      categoryB.id,
      { parentId: categoryA.id },
      testDatabaseClient,
      { hooks: { afterLock: async () => secondCategoryLocked.resolve() } },
    );
    await expect(remainsBlocked(secondCategoryLocked.promise)).resolves.toBe(
      true,
    );
    releaseCategory.resolve();
    await expect(firstCategoryMove).resolves.toMatchObject({
      parentId: categoryB.id,
    });
    await expect(secondCategoryMove).rejects.toMatchObject({
      code: 'ITEM_CATEGORY_CYCLE',
    });

    const [menuA, menuB] = await Promise.all([
      testDatabaseClient.menuItem.create({
        data: {
          companyId: company.id,
          code: 'menu-a',
          label: 'A',
          href: '/a',
          resourceCode: 'tree.a',
        },
      }),
      testDatabaseClient.menuItem.create({
        data: {
          companyId: company.id,
          code: 'menu-b',
          label: 'B',
          href: '/b',
          resourceCode: 'tree.b',
        },
      }),
    ]);
    const firstMenuLocked = deferred();
    const releaseMenu = deferred();
    const firstMenuMove = updateNavigationMenuItem(
      company.id,
      menuA.id,
      { parentId: menuB.id },
      testDatabaseClient,
      {
        hooks: {
          afterLock: async () => {
            firstMenuLocked.resolve();
            await releaseMenu.promise;
          },
        },
      },
    );
    await firstMenuLocked.promise;
    const secondMenuLocked = deferred();
    const secondMenuMove = updateNavigationMenuItem(
      company.id,
      menuB.id,
      { parentId: menuA.id },
      testDatabaseClient,
      { hooks: { afterLock: async () => secondMenuLocked.resolve() } },
    );
    await expect(remainsBlocked(secondMenuLocked.promise)).resolves.toBe(true);
    releaseMenu.resolve();
    await expect(firstMenuMove).resolves.toMatchObject({ parentId: menuB.id });
    await expect(secondMenuMove).rejects.toMatchObject({
      code: 'NAVIGATION_CYCLE',
    });
  });

  it('serializes child creation before parent deactivation', async () => {
    const company = await createTestCompany('U9-PARENT');
    const category = await createItemCategory(
      company.id,
      { code: 'PARENT', name: 'Parent' },
      testDatabaseClient,
    );
    const creationLocked = deferred();
    const releaseCreation = deferred();
    const itemCreation = createItem(
      company.id,
      {
        code: 'CHILD',
        name: 'Child',
        itemType: ItemType.RAW_MATERIAL,
        categoryId: category.id,
      },
      testDatabaseClient,
      {
        hooks: {
          afterLock: async () => {
            creationLocked.resolve();
            await releaseCreation.promise;
          },
        },
      },
    );
    await creationLocked.promise;
    const deactivationLocked = deferred();
    const categoryDeactivation = deactivateItemCategory(
      company.id,
      category.id,
      testDatabaseClient,
      { hooks: { afterLock: async () => deactivationLocked.resolve() } },
    );
    await expect(remainsBlocked(deactivationLocked.promise)).resolves.toBe(
      true,
    );
    releaseCreation.resolve();
    await expect(itemCreation).resolves.toMatchObject({
      categoryId: category.id,
    });
    await expect(categoryDeactivation).rejects.toMatchObject({
      code: 'ITEM_CATEGORY_NOT_EMPTY',
    });
  });

  it('revalidates BOM output/components under lock before competing deactivation', async () => {
    const company = await createTestCompany('U9-BOM-LOCK');
    const component = await createItem(
      company.id,
      { code: 'COMP', name: 'Component', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const output = await createItem(
      company.id,
      { code: 'OUT', name: 'Output', itemType: ItemType.FINISHED_GOOD },
      testDatabaseClient,
    );
    const bom = await createBom(
      company.id,
      { code: 'BOM', name: 'BOM', outputItemId: output.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      company.id,
      bom.versions[0].id,
      [{ itemId: component.id, quantity: '1' }],
      testDatabaseClient,
    );
    const activationLocked = deferred();
    const releaseActivation = deferred();
    const activation = activateBomRevision(
      company.id,
      bom.versions[0].id,
      testDatabaseClient,
      {
        hooks: {
          afterLock: async () => {
            activationLocked.resolve();
            await releaseActivation.promise;
          },
        },
      },
    );
    await activationLocked.promise;
    const componentDeactivationLocked = deferred();
    const componentDeactivation = deactivateItem(
      company.id,
      component.id,
      testDatabaseClient,
      {
        hooks: { afterLock: async () => componentDeactivationLocked.resolve() },
      },
    );
    const outputDeactivation = deactivateItem(
      company.id,
      output.id,
      testDatabaseClient,
    );
    const componentDeactivationResult = expect(
      componentDeactivation,
    ).rejects.toMatchObject({ code: 'ITEM_USED_BY_ACTIVE_BOM' });
    const outputDeactivationResult = expect(
      outputDeactivation,
    ).rejects.toMatchObject({ code: 'ITEM_USED_BY_ACTIVE_BOM' });
    await expect(
      remainsBlocked(componentDeactivationLocked.promise),
    ).resolves.toBe(true);
    releaseActivation.resolve();
    await expect(activation).resolves.toMatchObject({
      status: BomVersionStatus.ACTIVE,
    });
    await componentDeactivationResult;
    await outputDeactivationResult;
  });

  it('allocates revisions serially and rejects a stale competing activation without pins', async () => {
    const company = await createTestCompany('U9-BOM-REV');
    const component = await createItem(
      company.id,
      { code: 'COMP', name: 'Component', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const output = await createItem(
      company.id,
      { code: 'OUT', name: 'Output', itemType: ItemType.FINISHED_GOOD },
      testDatabaseClient,
    );
    const bom = await createBom(
      company.id,
      { code: 'BOM', name: 'BOM', outputItemId: output.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      company.id,
      bom.versions[0].id,
      [{ itemId: component.id, quantity: '1' }],
      testDatabaseClient,
    );
    await activateBomRevision(
      company.id,
      bom.versions[0].id,
      testDatabaseClient,
    );

    const allocationLocked = deferred();
    const releaseAllocation = deferred();
    const firstAllocation = createDraftBomRevision(
      company.id,
      bom.id,
      'first',
      testDatabaseClient,
      {
        hooks: {
          afterLock: async () => {
            allocationLocked.resolve();
            await releaseAllocation.promise;
          },
        },
      },
    );
    await allocationLocked.promise;
    const secondAllocationLocked = deferred();
    const secondAllocation = createDraftBomRevision(
      company.id,
      bom.id,
      'second',
      testDatabaseClient,
      { hooks: { afterLock: async () => secondAllocationLocked.resolve() } },
    );
    await expect(remainsBlocked(secondAllocationLocked.promise)).resolves.toBe(
      true,
    );
    releaseAllocation.resolve();
    const [revisionTwo, revisionThree] = await Promise.all([
      firstAllocation,
      secondAllocation,
    ]);
    expect([revisionTwo.revision, revisionThree.revision].sort()).toEqual([
      2, 3,
    ]);

    const activationLocked = deferred();
    const releaseActivation = deferred();
    const firstActivation = activateBomRevision(
      company.id,
      revisionTwo.id,
      testDatabaseClient,
      {
        hooks: {
          afterLock: async () => {
            activationLocked.resolve();
            await releaseActivation.promise;
          },
        },
      },
    );
    await activationLocked.promise;
    const secondActivationLocked = deferred();
    const staleActivation = activateBomRevision(
      company.id,
      revisionThree.id,
      testDatabaseClient,
      { hooks: { afterLock: async () => secondActivationLocked.resolve() } },
    );
    await expect(remainsBlocked(secondActivationLocked.promise)).resolves.toBe(
      true,
    );
    releaseActivation.resolve();
    await expect(firstActivation).resolves.toMatchObject({
      status: BomVersionStatus.ACTIVE,
    });
    await expect(staleActivation).rejects.toMatchObject({
      code: 'STALE_BOM_ACTIVATION',
    });
    await expect(
      testDatabaseClient.bomVersion.findUniqueOrThrow({
        where: { id: revisionThree.id },
        include: { components: true },
      }),
    ).resolves.toMatchObject({
      status: BomVersionStatus.DRAFT,
      components: [expect.objectContaining({ childBomVersionId: null })],
    });
  });

  it('canonicalizes equivalent replay and serializes parallel same-key conflict', async () => {
    const company = await createTestCompany('U9-IDEMP');
    const [itemA, itemB, warehouse] = await Promise.all([
      createItem(
        company.id,
        { code: 'A', name: 'A', itemType: ItemType.RAW_MATERIAL },
        testDatabaseClient,
      ),
      createItem(
        company.id,
        { code: 'B', name: 'B', itemType: ItemType.RAW_MATERIAL },
        testDatabaseClient,
      ),
      createWarehouse(
        company.id,
        { code: 'MAIN', name: 'Main' },
        testDatabaseClient,
      ),
    ]);
    const first = await postInventoryTransaction(
      company.id,
      {
        type: 'RECEIPT',
        idempotencyKey: 'canonical',
        occurredAt: '2026-07-14T00:00:00.000Z',
        reference: '  reference  ',
        memo: '   ',
        lines: [
          { itemId: itemA.id, warehouseId: warehouse.id, quantity: '2.0' },
          { itemId: itemB.id, warehouseId: warehouse.id, quantity: '3.000' },
        ],
      },
      { db: testDatabaseClient },
    );
    const lostAcknowledgementReplay = await postInventoryTransaction(
      company.id,
      {
        type: 'RECEIPT',
        idempotencyKey: 'canonical',
        occurredAt: '2026-07-14T09:00:00+09:00',
        reference: 'reference',
        memo: null,
        lines: [
          { itemId: itemB.id, warehouseId: warehouse.id, quantity: '3' },
          { itemId: itemA.id, warehouseId: warehouse.id, quantity: '2.000000' },
        ],
      },
      { db: testDatabaseClient },
    );
    expect(lostAcknowledgementReplay.id).toBe(first.id);

    const firstParallelLocked = deferred();
    const releaseFirstParallel = deferred();
    const parallelPayload = {
      type: 'RECEIPT' as const,
      idempotencyKey: 'parallel-equivalent',
      lines: [{ itemId: itemA.id, warehouseId: warehouse.id, quantity: '1.0' }],
    };
    const firstParallel = postInventoryTransaction(
      company.id,
      parallelPayload,
      {
        db: testDatabaseClient,
        hooks: {
          afterLock: async () => {
            firstParallelLocked.resolve();
            await releaseFirstParallel.promise;
          },
        },
      },
    );
    await firstParallelLocked.promise;
    const secondParallelLocked = deferred();
    const secondParallel = postInventoryTransaction(
      company.id,
      {
        ...parallelPayload,
        lines: [
          { itemId: itemA.id, warehouseId: warehouse.id, quantity: '1.000' },
        ],
      },
      {
        db: testDatabaseClient,
        hooks: { afterLock: async () => secondParallelLocked.resolve() },
      },
    );
    await expect(remainsBlocked(secondParallelLocked.promise)).resolves.toBe(
      true,
    );
    releaseFirstParallel.resolve();
    const [parallelOne, parallelTwo] = await Promise.all([
      firstParallel,
      secondParallel,
    ]);
    expect(parallelTwo.id).toBe(parallelOne.id);

    const conflictLocked = deferred();
    const releaseConflict = deferred();
    const conflictWinner = postInventoryTransaction(
      company.id,
      {
        type: 'RECEIPT',
        idempotencyKey: 'parallel-conflict',
        lines: [{ itemId: itemA.id, warehouseId: warehouse.id, quantity: '1' }],
      },
      {
        db: testDatabaseClient,
        hooks: {
          afterLock: async () => {
            conflictLocked.resolve();
            await releaseConflict.promise;
          },
        },
      },
    );
    await conflictLocked.promise;
    const conflictLoser = postInventoryTransaction(
      company.id,
      {
        type: 'RECEIPT',
        idempotencyKey: 'parallel-conflict',
        lines: [{ itemId: itemA.id, warehouseId: warehouse.id, quantity: '2' }],
      },
      { db: testDatabaseClient },
    );
    releaseConflict.resolve();
    await expect(conflictWinner).resolves.toMatchObject({
      idempotencyKey: 'parallel-conflict',
    });
    await expect(conflictLoser).rejects.toMatchObject({
      code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
    });
  });

  it('rejects inactive BOM/output/component without status or pin changes', async () => {
    const company = await createTestCompany('U9-BOM-VALID');
    const component = await createItem(
      company.id,
      { code: 'COMP', name: 'Component', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const output = await createItem(
      company.id,
      { code: 'OUT', name: 'Output', itemType: ItemType.FINISHED_GOOD },
      testDatabaseClient,
    );
    const bom = await createBom(
      company.id,
      { code: 'BOM', name: 'BOM', outputItemId: output.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      company.id,
      bom.versions[0].id,
      [{ itemId: component.id, quantity: '1' }],
      testDatabaseClient,
    );
    await deactivateItem(company.id, component.id, testDatabaseClient);
    await expect(
      activateBomRevision(company.id, bom.versions[0].id, testDatabaseClient),
    ).rejects.toMatchObject({ code: 'INVALID_BOM_COMPONENT' });
    await expect(
      testDatabaseClient.bomVersion.findUniqueOrThrow({
        where: { id: bom.versions[0].id },
        include: { components: true },
      }),
    ).resolves.toMatchObject({
      status: BomVersionStatus.DRAFT,
      components: [expect.objectContaining({ childBomVersionId: null })],
    });

    await testDatabaseClient.item.update({
      where: { id: component.id },
      data: { active: true },
    });
    await deactivateItem(company.id, output.id, testDatabaseClient);
    await expect(
      activateBomRevision(company.id, bom.versions[0].id, testDatabaseClient),
    ).rejects.toMatchObject({ code: 'INVALID_BOM_OUTPUT' });

    await testDatabaseClient.item.update({
      where: { id: output.id },
      data: { active: true },
    });
    await testDatabaseClient.bom.update({
      where: { id: bom.id },
      data: { active: false },
    });
    await expect(
      activateBomRevision(company.id, bom.versions[0].id, testDatabaseClient),
    ).rejects.toMatchObject({ code: 'BOM_INACTIVE' });
  });

  it('keeps navigation parent active when a concurrent deactivation loses', async () => {
    const company = await createTestCompany('U9-NAV-CHILD');
    const parent = await testDatabaseClient.menuItem.create({
      data: {
        companyId: company.id,
        code: 'parent',
        label: 'Parent',
        href: '/parent',
        resourceCode: 'parent',
      },
    });
    const child = await testDatabaseClient.menuItem.create({
      data: {
        companyId: company.id,
        parentId: parent.id,
        code: 'child',
        label: 'Child',
        href: '/child',
        resourceCode: 'child',
      },
    });
    await expect(
      deactivateNavigationMenuItem(company.id, parent.id, testDatabaseClient),
    ).rejects.toMatchObject({ code: 'NAVIGATION_HAS_CHILDREN' });
    await expect(
      testDatabaseClient.menuItem.findUniqueOrThrow({
        where: { id: parent.id },
      }),
    ).resolves.toMatchObject({ active: true });
    expect(child.parentId).toBe(parent.id);
  });
});
