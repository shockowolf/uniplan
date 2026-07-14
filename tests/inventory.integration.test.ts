import { ItemType } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  activateBomRevision,
  createBom,
  replaceDraftBomComponents,
} from '@/lib/domain/boms';
import { createItem } from '@/lib/domain/items';
import {
  postInventoryTransaction,
  reconcileInventory,
} from '@/lib/domain/inventory';
import {
  createTestCompany,
  resetTestDatabase,
  testDatabaseClient,
} from './helpers/database';

describe('atomic warehouse inventory ledger', () => {
  beforeEach(resetTestDatabase);
  afterAll(() => testDatabaseClient.$disconnect());

  async function createInventoryTestContext(companyCode = 'INV') {
    const company = await createTestCompany(companyCode);
    const mainWarehouse = await testDatabaseClient.warehouse.create({
      data: { companyId: company.id, code: 'MAIN', name: 'Main' },
    });
    const secondaryWarehouse = await testDatabaseClient.warehouse.create({
      data: { companyId: company.id, code: 'SECONDARY', name: 'Secondary' },
    });
    const inventoryItem = await createItem(
      company.id,
      { code: 'ITEM', name: 'Item', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    return { company, mainWarehouse, secondaryWarehouse, inventoryItem };
  }

  const readBalanceQuantity = async (
    companyId: string,
    itemId: string,
    warehouseId: string,
  ) =>
    (
      await testDatabaseClient.inventoryBalance.findUnique({
        where: {
          companyId_itemId_warehouseId: { companyId, itemId, warehouseId },
        },
      })
    )?.quantity.toFixed(6) ?? '0.000000';

  it('posts receipt, issue, transfer, adjustment, and reversal as signed immutable entries', async () => {
    const { company, mainWarehouse, secondaryWarehouse, inventoryItem } =
      await createInventoryTestContext('INV-OPS');
    await postInventoryTransaction(
      company.id,
      {
        type: 'RECEIPT',
        idempotencyKey: 'receipt',
        lines: [
          {
            itemId: inventoryItem.id,
            warehouseId: mainWarehouse.id,
            quantity: '10',
          },
        ],
      },
      { db: testDatabaseClient },
    );
    const issueTransaction = await postInventoryTransaction(
      company.id,
      {
        type: 'ISSUE',
        idempotencyKey: 'issue',
        lines: [
          {
            itemId: inventoryItem.id,
            warehouseId: mainWarehouse.id,
            quantity: '2',
          },
        ],
      },
      { db: testDatabaseClient },
    );
    const transferTransaction = await postInventoryTransaction(
      company.id,
      {
        type: 'TRANSFER',
        idempotencyKey: 'transfer',
        lines: [
          {
            itemId: inventoryItem.id,
            fromWarehouseId: mainWarehouse.id,
            toWarehouseId: secondaryWarehouse.id,
            quantity: '3',
          },
        ],
      },
      { db: testDatabaseClient },
    );
    await postInventoryTransaction(
      company.id,
      {
        type: 'ADJUSTMENT',
        idempotencyKey: 'adjustment',
        lines: [
          {
            itemId: inventoryItem.id,
            warehouseId: mainWarehouse.id,
            quantityDelta: '1',
          },
        ],
      },
      { db: testDatabaseClient },
    );
    const reversalTransaction = await postInventoryTransaction(
      company.id,
      {
        type: 'REVERSAL',
        idempotencyKey: 'reverse-issue',
        originalTransactionId: issueTransaction.id,
      },
      { db: testDatabaseClient },
    );

    expect(
      transferTransaction.entries.map((inventoryLedgerRecord) =>
        inventoryLedgerRecord.quantity.toFixed(6),
      ),
    ).toEqual(['-3.000000', '3.000000']);
    expect(reversalTransaction.reversalOfId).toBe(issueTransaction.id);
    await expect(
      readBalanceQuantity(company.id, inventoryItem.id, mainWarehouse.id),
    ).resolves.toBe('8.000000');
    await expect(
      readBalanceQuantity(company.id, inventoryItem.id, secondaryWarehouse.id),
    ).resolves.toBe('3.000000');
    await expect(
      testDatabaseClient.inventoryEntry.update({
        where: { id: issueTransaction.entries[0].id },
        data: { quantity: '-1' },
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it('rolls back all rows on insufficient stock and injected partial failure', async () => {
    const { company, mainWarehouse, inventoryItem } =
      await createInventoryTestContext('INV-ROLLBACK');
    await expect(
      postInventoryTransaction(
        company.id,
        {
          type: 'ISSUE',
          idempotencyKey: 'too-much',
          lines: [
            {
              itemId: inventoryItem.id,
              warehouseId: mainWarehouse.id,
              quantity: '1',
            },
          ],
        },
        { db: testDatabaseClient },
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(
      await testDatabaseClient.inventoryTransaction.count({
        where: { companyId: company.id },
      }),
    ).toBe(0);
    expect(
      await testDatabaseClient.inventoryBalance.count({
        where: { companyId: company.id },
      }),
    ).toBe(0);

    await expect(
      postInventoryTransaction(
        company.id,
        {
          type: 'RECEIPT',
          idempotencyKey: 'partial',
          lines: [
            {
              itemId: inventoryItem.id,
              warehouseId: mainWarehouse.id,
              quantity: '5',
            },
          ],
        },
        {
          db: testDatabaseClient,
          hooks: {
            afterEntries: async () => {
              throw new Error('injected failure');
            },
          },
        },
      ),
    ).rejects.toThrow('injected failure');
    expect(
      await testDatabaseClient.inventoryTransaction.count({
        where: { companyId: company.id },
      }),
    ).toBe(0);
    expect(
      await testDatabaseClient.inventoryEntry.count({
        where: { companyId: company.id },
      }),
    ).toBe(0);
    expect(
      await testDatabaseClient.inventoryBalance.count({
        where: { companyId: company.id },
      }),
    ).toBe(0);
  });

  it('enforces tenant-scoped idempotency and payload hash conflicts', async () => {
    const firstTenantContext = await createInventoryTestContext('INV-IDEMP-A');
    const secondTenantContext = await createInventoryTestContext('INV-IDEMP-B');
    const receiptRequest = {
      type: 'RECEIPT' as const,
      idempotencyKey: 'same-key',
      lines: [
        {
          itemId: firstTenantContext.inventoryItem.id,
          warehouseId: firstTenantContext.mainWarehouse.id,
          quantity: '2',
        },
      ],
    };
    const firstPosting = await postInventoryTransaction(
      firstTenantContext.company.id,
      receiptRequest,
      { db: testDatabaseClient },
    );
    const idempotentReplay = await postInventoryTransaction(
      firstTenantContext.company.id,
      receiptRequest,
      { db: testDatabaseClient },
    );
    expect(idempotentReplay.id).toBe(firstPosting.id);
    await expect(
      postInventoryTransaction(
        firstTenantContext.company.id,
        {
          ...receiptRequest,
          lines: [{ ...receiptRequest.lines[0], quantity: '3' }],
        },
        { db: testDatabaseClient },
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
    await expect(
      postInventoryTransaction(
        secondTenantContext.company.id,
        {
          type: 'RECEIPT',
          idempotencyKey: 'same-key',
          lines: [
            {
              itemId: secondTenantContext.inventoryItem.id,
              warehouseId: secondTenantContext.mainWarehouse.id,
              quantity: '1',
            },
          ],
        },
        { db: testDatabaseClient },
      ),
    ).resolves.toMatchObject({ idempotencyKey: 'same-key' });
  });

  it('serializes concurrent first receipts and concurrent issues without lost updates', async () => {
    const { company, mainWarehouse, inventoryItem } =
      await createInventoryTestContext('INV-CONCURRENT');
    await Promise.all(
      Array.from({ length: 4 }, (_, receiptNumber) =>
        postInventoryTransaction(
          company.id,
          {
            type: 'RECEIPT',
            idempotencyKey: `first-${receiptNumber}`,
            lines: [
              {
                itemId: inventoryItem.id,
                warehouseId: mainWarehouse.id,
                quantity: '1',
              },
            ],
          },
          { db: testDatabaseClient, maxAttempts: 6 },
        ),
      ),
    );
    await expect(
      readBalanceQuantity(company.id, inventoryItem.id, mainWarehouse.id),
    ).resolves.toBe('4.000000');
    await Promise.all(
      Array.from({ length: 4 }, (_, issueNumber) =>
        postInventoryTransaction(
          company.id,
          {
            type: 'ISSUE',
            idempotencyKey: `issue-${issueNumber}`,
            lines: [
              {
                itemId: inventoryItem.id,
                warehouseId: mainWarehouse.id,
                quantity: '1',
              },
            ],
          },
          { db: testDatabaseClient, maxAttempts: 6 },
        ),
      ),
    );
    await expect(
      readBalanceQuantity(company.id, inventoryItem.id, mainWarehouse.id),
    ).resolves.toBe('0.000000');
    expect(
      await testDatabaseClient.inventoryTransaction.count({
        where: { companyId: company.id },
      }),
    ).toBe(8);
  });

  it('posts multi-level production atomically from a fixed BOM revision', async () => {
    const company = await createTestCompany('INV-PRODUCTION');
    const productionWarehouse = await testDatabaseClient.warehouse.create({
      data: { companyId: company.id, code: 'MAIN', name: 'Main' },
    });
    const rawMaterialA = await createItem(
      company.id,
      { code: 'RAW-A', name: 'Raw A', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const rawMaterialB = await createItem(
      company.id,
      { code: 'RAW-B', name: 'Raw B', itemType: ItemType.RAW_MATERIAL },
      testDatabaseClient,
    );
    const subassemblyItem = await createItem(
      company.id,
      { code: 'SUB', name: 'Sub', itemType: ItemType.COMPONENT },
      testDatabaseClient,
    );
    const finishedGood = await createItem(
      company.id,
      { code: 'FINISHED', name: 'Finished', itemType: ItemType.FINISHED_GOOD },
      testDatabaseClient,
    );
    const subassemblyBom = await createBom(
      company.id,
      { code: 'BOM-SUB', name: 'Sub', outputItemId: subassemblyItem.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      company.id,
      subassemblyBom.versions[0].id,
      [{ itemId: rawMaterialA.id, quantity: '2' }],
      testDatabaseClient,
    );
    await activateBomRevision(
      company.id,
      subassemblyBom.versions[0].id,
      testDatabaseClient,
    );
    const finishedGoodBom = await createBom(
      company.id,
      { code: 'BOM-FINISHED', name: 'Finished', outputItemId: finishedGood.id },
      testDatabaseClient,
    );
    await replaceDraftBomComponents(
      company.id,
      finishedGoodBom.versions[0].id,
      [
        { itemId: subassemblyItem.id, quantity: '1' },
        { itemId: rawMaterialB.id, quantity: '1' },
      ],
      testDatabaseClient,
    );
    const activeFinishedGoodBomRevision = await activateBomRevision(
      company.id,
      finishedGoodBom.versions[0].id,
      testDatabaseClient,
    );
    await postInventoryTransaction(
      company.id,
      {
        type: 'OPENING',
        idempotencyKey: 'opening',
        lines: [
          {
            itemId: rawMaterialA.id,
            warehouseId: productionWarehouse.id,
            quantity: '10',
          },
          {
            itemId: rawMaterialB.id,
            warehouseId: productionWarehouse.id,
            quantity: '10',
          },
        ],
      },
      { db: testDatabaseClient },
    );
    const productionTransaction = await postInventoryTransaction(
      company.id,
      {
        type: 'PRODUCTION',
        idempotencyKey: 'production-1',
        bomVersionId: activeFinishedGoodBomRevision.id,
        quantity: '3',
        componentWarehouseId: productionWarehouse.id,
        outputWarehouseId: productionWarehouse.id,
      },
      { db: testDatabaseClient },
    );
    expect(productionTransaction.bomVersionId).toBe(
      activeFinishedGoodBomRevision.id,
    );
    await expect(
      readBalanceQuantity(company.id, rawMaterialA.id, productionWarehouse.id),
    ).resolves.toBe('4.000000');
    await expect(
      readBalanceQuantity(company.id, rawMaterialB.id, productionWarehouse.id),
    ).resolves.toBe('7.000000');
    await expect(
      readBalanceQuantity(company.id, finishedGood.id, productionWarehouse.id),
    ).resolves.toBe('3.000000');

    const transactionCountBeforeRejectedProduction =
      await testDatabaseClient.inventoryTransaction.count({
        where: { companyId: company.id },
      });
    await expect(
      postInventoryTransaction(
        company.id,
        {
          type: 'PRODUCTION',
          idempotencyKey: 'production-insufficient',
          bomVersionId: activeFinishedGoodBomRevision.id,
          quantity: '100',
          componentWarehouseId: productionWarehouse.id,
          outputWarehouseId: productionWarehouse.id,
        },
        { db: testDatabaseClient },
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(
      await testDatabaseClient.inventoryTransaction.count({
        where: { companyId: company.id },
      }),
    ).toBe(transactionCountBeforeRejectedProduction);
    await expect(
      readBalanceQuantity(company.id, finishedGood.id, productionWarehouse.id),
    ).resolves.toBe('3.000000');
  });

  it('reconciles the ledger projection and rejects direct on-hand mutation', async () => {
    const { company, mainWarehouse, inventoryItem } =
      await createInventoryTestContext('INV-RECONCILE');
    await postInventoryTransaction(
      company.id,
      {
        type: 'RECEIPT',
        idempotencyKey: 'receipt',
        lines: [
          {
            itemId: inventoryItem.id,
            warehouseId: mainWarehouse.id,
            quantity: '2.5',
          },
        ],
      },
      { db: testDatabaseClient },
    );
    await expect(
      reconcileInventory(company.id, testDatabaseClient),
    ).resolves.toEqual([]);
    const inventoryBalance =
      await testDatabaseClient.inventoryBalance.findFirstOrThrow({
        where: { companyId: company.id },
      });
    await expect(
      testDatabaseClient.inventoryBalance.update({
        where: { id: inventoryBalance.id },
        data: { quantity: '9' },
      }),
    ).rejects.toThrow(/posting an inventory transaction/i);
  });
});
