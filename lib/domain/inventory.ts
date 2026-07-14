import { createHash } from 'node:crypto';
import {
  InventoryTransactionType,
  Prisma,
  type InventoryTransaction,
  type PrismaClient,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import { explodeBomRevision } from '@/lib/domain/boms';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/domain/errors';

type Quantity = Prisma.Decimal.Value;

type CommonInput = {
  idempotencyKey: string;
  occurredAt?: Date | string;
  reference?: string | null;
  memo?: string | null;
  createdById?: string | null;
};

type SimpleLine = { itemId: string; warehouseId: string; quantity: Quantity };

export type PostInventoryTransactionInput = CommonInput &
  (
    | { type: 'OPENING' | 'RECEIPT' | 'ISSUE'; lines: SimpleLine[] }
    | {
        type: 'TRANSFER';
        lines: {
          itemId: string;
          fromWarehouseId: string;
          toWarehouseId: string;
          quantity: Quantity;
        }[];
      }
    | {
        type: 'ADJUSTMENT';
        lines: {
          itemId: string;
          warehouseId: string;
          quantityDelta: Quantity;
        }[];
      }
    | {
        type: 'PRODUCTION';
        bomVersionId: string;
        quantity: Quantity;
        componentWarehouseId: string;
        outputWarehouseId: string;
      }
    | { type: 'REVERSAL'; originalTransactionId: string }
  );

type PlannedInventoryEntry = {
  itemId: string;
  warehouseId: string;
  quantity: Prisma.Decimal;
};

type InventoryPostingPlan = {
  plannedInventoryEntries: PlannedInventoryEntry[];
  bomVersionId: string | null;
  reversalOfId: string | null;
};

type CalculatedBalanceUpdate = {
  plannedInventoryEntry: PlannedInventoryEntry;
  calculatedQuantity: Prisma.Decimal;
};

type InventoryPostingMetadata = {
  idempotencyKey: string;
  payloadHash: string;
};

export type InventoryPostingHooks = {
  afterEntries?: (
    databaseTransaction: Prisma.TransactionClient,
    transactionId: string,
  ) => Promise<void>;
};

export class IdempotencyConflictError extends ConflictError {
  constructor() {
    super(
      'The idempotency key was already used with a different payload',
      'IDEMPOTENCY_PAYLOAD_CONFLICT',
    );
  }
}

function requiredText(value: string, field: string) {
  const normalizedText = value.trim();
  if (!normalizedText) throw new ValidationError(`${field} is required`);
  return normalizedText;
}

function positive(value: Quantity, field = 'quantity') {
  try {
    const positiveQuantity = new Prisma.Decimal(value);
    if (!positiveQuantity.isPositive())
      throw new ValidationError(
        `${field} must be positive`,
        'INVALID_INVENTORY_QUANTITY',
      );
    return positiveQuantity;
  } catch (quantityError) {
    if (quantityError instanceof ValidationError) throw quantityError;
    throw new ValidationError(
      `${field} is invalid`,
      'INVALID_INVENTORY_QUANTITY',
    );
  }
}

function nonzero(value: Quantity, field = 'quantityDelta') {
  try {
    const nonzeroQuantity = new Prisma.Decimal(value);
    if (nonzeroQuantity.isZero())
      throw new ValidationError(
        `${field} must be non-zero`,
        'INVALID_INVENTORY_QUANTITY',
      );
    return nonzeroQuantity;
  } catch (quantityError) {
    if (quantityError instanceof ValidationError) throw quantityError;
    throw new ValidationError(
      `${field} is invalid`,
      'INVALID_INVENTORY_QUANTITY',
    );
  }
}

function stableValue(valueToSerialize: unknown): unknown {
  if (valueToSerialize instanceof Date) return valueToSerialize.toISOString();
  if (Prisma.Decimal.isDecimal(valueToSerialize))
    return valueToSerialize.toFixed();
  if (Array.isArray(valueToSerialize)) return valueToSerialize.map(stableValue);
  if (valueToSerialize && typeof valueToSerialize === 'object') {
    return Object.fromEntries(
      Object.entries(valueToSerialize as Record<string, unknown>)
        .filter(([, objectEntryValue]) => objectEntryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([objectKey, objectEntryValue]) => [
          objectKey,
          stableValue(objectEntryValue),
        ]),
    );
  }
  return valueToSerialize;
}

export function hashInventoryPayload(input: PostInventoryTransactionInput) {
  const inventoryPayload = {
    ...input,
    idempotencyKey: undefined,
    occurredAt: input.occurredAt
      ? new Date(input.occurredAt).toISOString()
      : null,
  };
  return createHash('sha256')
    .update(JSON.stringify(stableValue(inventoryPayload)))
    .digest('hex');
}

function parseOccurredAt(occurredAtValue: Date | string | undefined) {
  const occurredAt = occurredAtValue ? new Date(occurredAtValue) : new Date();
  if (Number.isNaN(occurredAt.valueOf()))
    throw new ValidationError('occurredAt must be a valid date');
  return occurredAt;
}

async function buildInventoryPostingPlan(
  companyId: string,
  input: PostInventoryTransactionInput,
  databaseTransaction: Prisma.TransactionClient,
): Promise<InventoryPostingPlan> {
  let plannedInventoryEntries: PlannedInventoryEntry[] = [];
  let bomVersionId: string | null = null;
  let reversalOfId: string | null = null;

  if (
    input.type === 'OPENING' ||
    input.type === 'RECEIPT' ||
    input.type === 'ISSUE'
  ) {
    if (input.lines.length === 0)
      throw new ValidationError('At least one inventory line is required');
    const sign = input.type === 'ISSUE' ? -1 : 1;
    plannedInventoryEntries = input.lines.map((inventoryLine) => ({
      itemId: inventoryLine.itemId,
      warehouseId: inventoryLine.warehouseId,
      quantity: positive(inventoryLine.quantity).mul(sign),
    }));
  } else if (input.type === 'TRANSFER') {
    if (input.lines.length === 0)
      throw new ValidationError('At least one transfer line is required');
    plannedInventoryEntries = input.lines.flatMap((transferLine) => {
      if (transferLine.fromWarehouseId === transferLine.toWarehouseId)
        throw new ValidationError(
          'Transfer warehouses must differ',
          'INVALID_TRANSFER',
        );
      const transferQuantity = positive(transferLine.quantity);
      return [
        {
          itemId: transferLine.itemId,
          warehouseId: transferLine.fromWarehouseId,
          quantity: transferQuantity.neg(),
        },
        {
          itemId: transferLine.itemId,
          warehouseId: transferLine.toWarehouseId,
          quantity: transferQuantity,
        },
      ];
    });
  } else if (input.type === 'ADJUSTMENT') {
    if (input.lines.length === 0)
      throw new ValidationError('At least one adjustment line is required');
    plannedInventoryEntries = input.lines.map((adjustmentLine) => ({
      itemId: adjustmentLine.itemId,
      warehouseId: adjustmentLine.warehouseId,
      quantity: nonzero(adjustmentLine.quantityDelta),
    }));
  } else if (input.type === 'PRODUCTION') {
    const productionQuantity = positive(input.quantity);
    const activeBomVersion = await databaseTransaction.bomVersion.findFirst({
      where: {
        id: input.bomVersionId,
        status: 'ACTIVE',
        bom: { companyId, active: true },
      },
      select: { id: true, bom: { select: { outputItemId: true } } },
    });
    if (!activeBomVersion)
      throw new NotFoundError('Active BOM revision not found');
    const componentRequirements = await explodeBomRevision(
      companyId,
      activeBomVersion.id,
      productionQuantity,
      databaseTransaction,
    );
    plannedInventoryEntries = [
      ...componentRequirements.map((componentRequirement) => ({
        itemId: componentRequirement.itemId,
        warehouseId: input.componentWarehouseId,
        quantity: componentRequirement.quantity.neg(),
      })),
      {
        itemId: activeBomVersion.bom.outputItemId,
        warehouseId: input.outputWarehouseId,
        quantity: productionQuantity,
      },
    ];
    bomVersionId = activeBomVersion.id;
  } else if (input.type === 'REVERSAL') {
    const originalInventoryTransaction =
      await databaseTransaction.inventoryTransaction.findFirst({
        where: { id: input.originalTransactionId, companyId },
        include: {
          entries: { orderBy: { lineNumber: 'asc' } },
          reversal: { select: { id: true } },
        },
      });
    if (!originalInventoryTransaction)
      throw new NotFoundError('Inventory transaction to reverse was not found');
    if (
      originalInventoryTransaction.transactionType ===
      InventoryTransactionType.REVERSAL
    ) {
      throw new ConflictError(
        'A reversal transaction cannot itself be reversed',
        'REVERSAL_OF_REVERSAL',
      );
    }
    if (originalInventoryTransaction.reversal)
      throw new ConflictError(
        'Inventory transaction has already been reversed',
        'ALREADY_REVERSED',
      );
    plannedInventoryEntries = originalInventoryTransaction.entries.map(
      (inventoryLedgerRecord) => ({
        itemId: inventoryLedgerRecord.itemId,
        warehouseId: inventoryLedgerRecord.warehouseId,
        quantity: inventoryLedgerRecord.quantity.neg(),
      }),
    );
    reversalOfId = originalInventoryTransaction.id;
  } else {
    throw new ValidationError('Unsupported inventory transaction type');
  }

  const aggregatedEntriesByBalanceKey = new Map<
    string,
    PlannedInventoryEntry
  >();
  for (const plannedInventoryEntry of plannedInventoryEntries) {
    const balanceKey = `${plannedInventoryEntry.warehouseId}\u0000${plannedInventoryEntry.itemId}`;
    const existingPlannedEntry = aggregatedEntriesByBalanceKey.get(balanceKey);
    aggregatedEntriesByBalanceKey.set(balanceKey, {
      ...plannedInventoryEntry,
      quantity: (existingPlannedEntry?.quantity ?? new Prisma.Decimal(0)).add(
        plannedInventoryEntry.quantity,
      ),
    });
  }
  plannedInventoryEntries = [...aggregatedEntriesByBalanceKey.values()]
    .filter((plannedInventoryEntry) => !plannedInventoryEntry.quantity.isZero())
    .sort(
      (left, right) =>
        left.warehouseId.localeCompare(right.warehouseId) ||
        left.itemId.localeCompare(right.itemId),
    );
  if (plannedInventoryEntries.length === 0)
    throw new ValidationError(
      'Inventory transaction has no net effect',
      'EMPTY_INVENTORY_TRANSACTION',
    );
  return { plannedInventoryEntries, bomVersionId, reversalOfId };
}

async function validateInventoryPostingReferences(
  companyId: string,
  input: PostInventoryTransactionInput,
  plannedInventoryEntries: PlannedInventoryEntry[],
  databaseTransaction: Prisma.TransactionClient,
) {
  const itemIds = [
    ...new Set(
      plannedInventoryEntries.map(
        (plannedInventoryEntry) => plannedInventoryEntry.itemId,
      ),
    ),
  ];
  const warehouseIds = [
    ...new Set(
      plannedInventoryEntries.map(
        (plannedInventoryEntry) => plannedInventoryEntry.warehouseId,
      ),
    ),
  ];
  const [inventoryItems, warehouses] = await Promise.all([
    databaseTransaction.item.findMany({
      where: {
        companyId,
        id: { in: itemIds },
        active: true,
        trackInventory: true,
      },
      select: { id: true },
    }),
    databaseTransaction.warehouse.findMany({
      where: { companyId, id: { in: warehouseIds }, active: true },
      select: { id: true },
    }),
  ]);
  if (inventoryItems.length !== itemIds.length)
    throw new ValidationError(
      'All items must be active, inventory tracked, and belong to the same company',
      'INVALID_INVENTORY_ITEM',
    );
  if (warehouses.length !== warehouseIds.length)
    throw new ValidationError(
      'All warehouses must be active and belong to the same company',
      'INVALID_WAREHOUSE',
    );
  if (input.createdById) {
    const postingUser = await databaseTransaction.user.findFirst({
      where: { id: input.createdById, companyId, status: 'active' },
      select: { id: true },
    });
    if (!postingUser)
      throw new ValidationError(
        'Posting user must belong to the same company',
        'INVALID_POSTING_USER',
      );
  }
}

async function createAndLockInventoryBalances(
  companyId: string,
  plannedInventoryEntries: PlannedInventoryEntry[],
  databaseTransaction: Prisma.TransactionClient,
) {
  // Every posting uses the same sorted lock order to avoid deadlocks between overlapping warehouse movements.
  for (const plannedInventoryEntry of plannedInventoryEntries) {
    await databaseTransaction.inventoryBalance.upsert({
      where: {
        companyId_itemId_warehouseId: {
          companyId,
          itemId: plannedInventoryEntry.itemId,
          warehouseId: plannedInventoryEntry.warehouseId,
        },
      },
      update: {},
      create: {
        companyId,
        itemId: plannedInventoryEntry.itemId,
        warehouseId: plannedInventoryEntry.warehouseId,
        quantity: 0,
        safetyQuantity: 0,
      },
    });
  }
  for (const plannedInventoryEntry of plannedInventoryEntries) {
    await databaseTransaction.$queryRaw`
      SELECT "id"
      FROM "inventory_balances"
      WHERE "companyId" = ${companyId}
        AND "warehouseId" = ${plannedInventoryEntry.warehouseId}
        AND "itemId" = ${plannedInventoryEntry.itemId}
      FOR UPDATE
    `;
  }
  return databaseTransaction.inventoryBalance.findMany({
    where: {
      companyId,
      OR: plannedInventoryEntries.map((plannedInventoryEntry) => ({
        itemId: plannedInventoryEntry.itemId,
        warehouseId: plannedInventoryEntry.warehouseId,
      })),
    },
  });
}

function calculateBalanceUpdates(
  plannedInventoryEntries: PlannedInventoryEntry[],
  lockedInventoryBalances: Awaited<
    ReturnType<typeof createAndLockInventoryBalances>
  >,
): CalculatedBalanceUpdate[] {
  const inventoryBalanceByKey = new Map(
    lockedInventoryBalances.map((inventoryBalance) => [
      `${inventoryBalance.warehouseId}\u0000${inventoryBalance.itemId}`,
      inventoryBalance,
    ]),
  );

  return plannedInventoryEntries.map((plannedInventoryEntry) => {
    const inventoryBalance = inventoryBalanceByKey.get(
      `${plannedInventoryEntry.warehouseId}\u0000${plannedInventoryEntry.itemId}`,
    );
    if (!inventoryBalance)
      throw new ConflictError(
        'Locked inventory balance disappeared',
        'INVENTORY_BALANCE_MISSING',
      );
    const calculatedQuantity = inventoryBalance.quantity.add(
      plannedInventoryEntry.quantity,
    );
    if (calculatedQuantity.isNegative())
      throw new ConflictError(
        'Insufficient on-hand inventory',
        'INSUFFICIENT_STOCK',
      );
    return { plannedInventoryEntry, calculatedQuantity };
  });
}

function isRetryable(postingError: unknown) {
  if (
    postingError instanceof Prisma.PrismaClientKnownRequestError &&
    postingError.code === 'P2034'
  )
    return true;
  const code = (
    postingError as { code?: string; meta?: { code?: string } } | null
  )?.code;
  const sqlState = (postingError as { meta?: { code?: string } } | null)?.meta
    ?.code;
  return (
    code === '40001' ||
    code === '40P01' ||
    sqlState === '40001' ||
    sqlState === '40P01'
  );
}

function isUniqueConflict(postingError: unknown) {
  return (
    postingError instanceof Prisma.PrismaClientKnownRequestError &&
    postingError.code === 'P2002'
  );
}

const inventoryTransactionInclude = {
  entries: { orderBy: { lineNumber: 'asc' as const } },
};

async function findIdempotentInventoryTransaction(
  companyId: string,
  idempotencyKey: string,
  payloadHash: string,
  databaseClient: PrismaClient | Prisma.TransactionClient,
) {
  const existingInventoryTransaction =
    await databaseClient.inventoryTransaction.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
      include: inventoryTransactionInclude,
    });
  if (
    existingInventoryTransaction &&
    existingInventoryTransaction.payloadHash !== payloadHash
  ) {
    throw new IdempotencyConflictError();
  }
  return existingInventoryTransaction;
}

async function executeInventoryPostingTransaction(
  companyId: string,
  input: PostInventoryTransactionInput,
  postingMetadata: InventoryPostingMetadata,
  hooks: InventoryPostingHooks | undefined,
  databaseTransaction: Prisma.TransactionClient,
) {
  // Rechecking inside the transaction makes concurrent retries return the original posting instead of duplicating it.
  const existingInventoryTransaction = await findIdempotentInventoryTransaction(
    companyId,
    postingMetadata.idempotencyKey,
    postingMetadata.payloadHash,
    databaseTransaction,
  );
  if (existingInventoryTransaction) return existingInventoryTransaction;

  const inventoryPostingPlan = await buildInventoryPostingPlan(
    companyId,
    input,
    databaseTransaction,
  );
  await validateInventoryPostingReferences(
    companyId,
    input,
    inventoryPostingPlan.plannedInventoryEntries,
    databaseTransaction,
  );
  const lockedInventoryBalances = await createAndLockInventoryBalances(
    companyId,
    inventoryPostingPlan.plannedInventoryEntries,
    databaseTransaction,
  );
  const calculatedBalanceUpdates = calculateBalanceUpdates(
    inventoryPostingPlan.plannedInventoryEntries,
    lockedInventoryBalances,
  );

  const inventoryTransaction =
    await databaseTransaction.inventoryTransaction.create({
      data: {
        companyId,
        transactionType: InventoryTransactionType[input.type],
        idempotencyKey: postingMetadata.idempotencyKey,
        payloadHash: postingMetadata.payloadHash,
        occurredAt: parseOccurredAt(input.occurredAt),
        reference: input.reference?.trim() || null,
        memo: input.memo?.trim() || null,
        createdById: input.createdById ?? null,
        bomVersionId: inventoryPostingPlan.bomVersionId,
        reversalOfId: inventoryPostingPlan.reversalOfId,
      },
    });

  // The transaction-local guard keeps immutable ledger and balance writes exclusive to this posting service.
  await databaseTransaction.$executeRaw`SELECT set_config('uniplan.inventory_posting', 'on', true)`;
  await databaseTransaction.inventoryEntry.createMany({
    data: inventoryPostingPlan.plannedInventoryEntries.map(
      (plannedInventoryEntry, entryIndex) => ({
        companyId,
        transactionId: inventoryTransaction.id,
        lineNumber: entryIndex + 1,
        itemId: plannedInventoryEntry.itemId,
        warehouseId: plannedInventoryEntry.warehouseId,
        quantity: plannedInventoryEntry.quantity,
      }),
    ),
  });
  await hooks?.afterEntries?.(databaseTransaction, inventoryTransaction.id);

  for (const balanceUpdate of calculatedBalanceUpdates) {
    await databaseTransaction.inventoryBalance.update({
      where: {
        companyId_itemId_warehouseId: {
          companyId,
          itemId: balanceUpdate.plannedInventoryEntry.itemId,
          warehouseId: balanceUpdate.plannedInventoryEntry.warehouseId,
        },
      },
      data: { quantity: balanceUpdate.calculatedQuantity },
    });
  }

  return databaseTransaction.inventoryTransaction.findUniqueOrThrow({
    where: { id: inventoryTransaction.id, companyId },
    include: inventoryTransactionInclude,
  });
}

export async function postInventoryTransaction(
  companyId: string,
  input: PostInventoryTransactionInput,
  options: {
    db?: PrismaClient;
    maxAttempts?: number;
    hooks?: InventoryPostingHooks;
  } = {},
) {
  const databaseClient = options.db ?? prisma;
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey');
  if (idempotencyKey.length > 200)
    throw new ValidationError('idempotencyKey is too long');
  const payloadHash = hashInventoryPayload(input);
  const postingMetadata = { idempotencyKey, payloadHash };
  const existingInventoryTransaction = await findIdempotentInventoryTransaction(
    companyId,
    idempotencyKey,
    payloadHash,
    databaseClient,
  );
  if (existingInventoryTransaction) return existingInventoryTransaction;

  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 4, 6));
  // Serializable conflicts and deadlocks are transient, so retries are bounded to protect request latency.
  for (
    let attemptNumber = 1;
    attemptNumber <= maxAttempts;
    attemptNumber += 1
  ) {
    try {
      return await databaseClient.$transaction(
        (databaseTransaction) =>
          executeInventoryPostingTransaction(
            companyId,
            input,
            postingMetadata,
            options.hooks,
            databaseTransaction,
          ),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 20_000,
        },
      );
    } catch (postingError) {
      if (isUniqueConflict(postingError)) {
        const concurrentlyPostedTransaction =
          await findIdempotentInventoryTransaction(
            companyId,
            idempotencyKey,
            payloadHash,
            databaseClient,
          );
        if (concurrentlyPostedTransaction) return concurrentlyPostedTransaction;
      }
      if (!isRetryable(postingError) || attemptNumber === maxAttempts)
        throw postingError;
      await new Promise((resolveRetryDelay) =>
        setTimeout(resolveRetryDelay, attemptNumber * 10),
      );
    }
  }
  throw new ConflictError(
    'Inventory transaction retry limit exceeded',
    'INVENTORY_RETRY_EXHAUSTED',
  );
}

export type ReconciliationMismatch = {
  itemId: string;
  warehouseId: string;
  ledgerQuantity: Prisma.Decimal;
  balanceQuantity: Prisma.Decimal;
  difference: Prisma.Decimal;
};

export async function reconcileInventory(
  companyId: string,
  databaseClient: PrismaClient = prisma,
): Promise<ReconciliationMismatch[]> {
  const [ledgerQuantityGroups, inventoryBalances] = await Promise.all([
    databaseClient.inventoryEntry.groupBy({
      by: ['itemId', 'warehouseId'],
      where: { companyId },
      _sum: { quantity: true },
    }),
    databaseClient.inventoryBalance.findMany({
      where: { companyId },
      select: { itemId: true, warehouseId: true, quantity: true },
    }),
  ]);
  const balanceKeys = new Set([
    ...ledgerQuantityGroups.map(
      (ledgerQuantityGroup) =>
        `${ledgerQuantityGroup.warehouseId}\u0000${ledgerQuantityGroup.itemId}`,
    ),
    ...inventoryBalances.map(
      (inventoryBalance) =>
        `${inventoryBalance.warehouseId}\u0000${inventoryBalance.itemId}`,
    ),
  ]);
  const ledgerQuantityByBalanceKey = new Map(
    ledgerQuantityGroups.map((ledgerQuantityGroup) => [
      `${ledgerQuantityGroup.warehouseId}\u0000${ledgerQuantityGroup.itemId}`,
      ledgerQuantityGroup._sum.quantity ?? new Prisma.Decimal(0),
    ]),
  );
  const projectedQuantityByBalanceKey = new Map(
    inventoryBalances.map((inventoryBalance) => [
      `${inventoryBalance.warehouseId}\u0000${inventoryBalance.itemId}`,
      inventoryBalance.quantity,
    ]),
  );
  return [...balanceKeys]
    .sort()
    .map((balanceKey) => {
      const [warehouseId, itemId] = balanceKey.split('\u0000');
      const ledgerQuantity =
        ledgerQuantityByBalanceKey.get(balanceKey) ?? new Prisma.Decimal(0);
      const balanceQuantity =
        projectedQuantityByBalanceKey.get(balanceKey) ?? new Prisma.Decimal(0);
      return {
        itemId,
        warehouseId,
        ledgerQuantity,
        balanceQuantity,
        difference: ledgerQuantity.sub(balanceQuantity),
      };
    })
    .filter(
      (reconciliationMismatch) => !reconciliationMismatch.difference.isZero(),
    );
}

export async function createWarehouse(
  companyId: string,
  input: { code: string; name: string; location?: string | null },
  databaseClient: PrismaClient = prisma,
) {
  return databaseClient.warehouse.create({
    data: {
      companyId,
      code: requiredText(input.code, 'code'),
      name: requiredText(input.name, 'name'),
      location: input.location?.trim() || null,
    },
  });
}

export async function updateWarehouse(
  companyId: string,
  warehouseId: string,
  input: { code?: string; name?: string; location?: string | null },
  databaseClient: PrismaClient = prisma,
) {
  const warehouse = await databaseClient.warehouse.findFirst({
    where: { id: warehouseId, companyId },
    select: { id: true },
  });
  if (!warehouse) throw new NotFoundError('Warehouse not found');
  return databaseClient.warehouse.update({
    where: { id: warehouseId, companyId },
    data: {
      ...(input.code !== undefined
        ? { code: requiredText(input.code, 'code') }
        : {}),
      ...(input.name !== undefined
        ? { name: requiredText(input.name, 'name') }
        : {}),
      ...(input.location !== undefined
        ? { location: input.location?.trim() || null }
        : {}),
    },
  });
}

export async function deactivateWarehouse(
  companyId: string,
  warehouseId: string,
  databaseClient: PrismaClient = prisma,
) {
  const warehouse = await databaseClient.warehouse.findFirst({
    where: { id: warehouseId, companyId },
    select: {
      id: true,
      inventoryBalances: {
        where: { quantity: { not: 0 } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!warehouse) throw new NotFoundError('Warehouse not found');
  if (warehouse.inventoryBalances.length > 0)
    throw new ConflictError(
      'Warehouse with on-hand inventory cannot be deactivated',
      'WAREHOUSE_HAS_STOCK',
    );
  return databaseClient.warehouse.update({
    where: { id: warehouseId, companyId },
    data: { active: false },
  });
}

export async function updateSafetyQuantity(
  companyId: string,
  inventoryBalanceId: string,
  safetyQuantityValue: Quantity,
  databaseClient: PrismaClient = prisma,
) {
  let safetyQuantity: Prisma.Decimal;
  try {
    safetyQuantity = new Prisma.Decimal(safetyQuantityValue);
    if (safetyQuantity.isNegative()) {
      throw new ValidationError(
        'safetyQuantity cannot be negative',
        'INVALID_SAFETY_QUANTITY',
      );
    }
  } catch (quantityError) {
    if (quantityError instanceof ValidationError) throw quantityError;
    throw new ValidationError(
      'safetyQuantity is invalid',
      'INVALID_SAFETY_QUANTITY',
    );
  }
  const inventoryBalance = await databaseClient.inventoryBalance.findFirst({
    where: { id: inventoryBalanceId, companyId },
    select: { id: true },
  });
  if (!inventoryBalance) throw new NotFoundError('Inventory balance not found');
  return databaseClient.inventoryBalance.update({
    where: { id: inventoryBalanceId, companyId },
    data: { safetyQuantity },
  });
}

export type PostedInventoryTransaction = InventoryTransaction & {
  entries: { quantity: Prisma.Decimal }[];
};
