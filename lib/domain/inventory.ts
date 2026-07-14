import { createHash } from 'node:crypto';
import {
  InventoryTransactionType,
  Prisma,
  type InventoryTransaction,
  type PrismaClient,
} from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  recordMutationAuditEvent,
  type AuditWriteHooks,
  type TrustedMutationActor,
} from '@/lib/audit/service.server';
import { explodeBomRevision } from '@/lib/domain/boms';
import {
  type CompanyMutationHooks,
  type CompanyMutationOptions,
  withCompanyMutationTransaction,
} from '@/lib/domain/concurrency';
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

export type InventoryPostingHooks = CompanyMutationHooks & AuditWriteHooks & {
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

function canonicalLineOrder(
  left: Record<string, string>,
  right: Record<string, string>,
) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

/**
 * Actor identity is deliberately part of operation identity because it is
 * persisted on the immutable transaction header. Line order is not: logical
 * lines are sorted after decimal validation and normalization.
 */
export function canonicalizeInventoryPayload(
  input: PostInventoryTransactionInput,
  actorUserId: string,
) {
  const commonPayload = {
    type: input.type,
    occurredAt: input.occurredAt
      ? parseOccurredAt(input.occurredAt).toISOString()
      : null,
    reference: input.reference?.trim() || null,
    memo: input.memo?.trim() || null,
    createdById: actorUserId,
  };
  if (
    input.type === 'OPENING' ||
    input.type === 'RECEIPT' ||
    input.type === 'ISSUE'
  ) {
    if (input.lines.length === 0)
      throw new ValidationError('At least one inventory line is required');
    return {
      ...commonPayload,
      lines: input.lines
        .map((line) => ({
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          quantity: positive(line.quantity).toFixed(),
        }))
        .sort(canonicalLineOrder),
    };
  }
  if (input.type === 'TRANSFER') {
    if (input.lines.length === 0)
      throw new ValidationError('At least one transfer line is required');
    return {
      ...commonPayload,
      lines: input.lines
        .map((line) => {
          if (line.fromWarehouseId === line.toWarehouseId)
            throw new ValidationError(
              'Transfer warehouses must differ',
              'INVALID_TRANSFER',
            );
          return {
            itemId: line.itemId,
            fromWarehouseId: line.fromWarehouseId,
            toWarehouseId: line.toWarehouseId,
            quantity: positive(line.quantity).toFixed(),
          };
        })
        .sort(canonicalLineOrder),
    };
  }
  if (input.type === 'ADJUSTMENT') {
    if (input.lines.length === 0)
      throw new ValidationError('At least one adjustment line is required');
    return {
      ...commonPayload,
      lines: input.lines
        .map((line) => ({
          itemId: line.itemId,
          warehouseId: line.warehouseId,
          quantityDelta: nonzero(line.quantityDelta).toFixed(),
        }))
        .sort(canonicalLineOrder),
    };
  }
  if (input.type === 'PRODUCTION') {
    return {
      ...commonPayload,
      bomVersionId: input.bomVersionId,
      quantity: positive(input.quantity).toFixed(),
      componentWarehouseId: input.componentWarehouseId,
      outputWarehouseId: input.outputWarehouseId,
    };
  }
  if (input.type === 'REVERSAL') {
    return {
      ...commonPayload,
      originalTransactionId: input.originalTransactionId,
    };
  }
  throw new ValidationError('Unsupported inventory transaction type');
}

export function hashInventoryPayload(
  input: PostInventoryTransactionInput,
  actorUserId: string,
) {
  return createHash('sha256')
    .update(
      JSON.stringify(stableValue(canonicalizeInventoryPayload(input, actorUserId))),
    )
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
  actorUserId: string,
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
  const postingUser = await databaseTransaction.user.findFirst({
    where: { id: actorUserId, companyId, status: 'active' },
    select: { id: true },
  });
  if (!postingUser)
    throw new ValidationError(
      'Posting user must belong to the same company',
      'INVALID_POSTING_USER',
    );
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
  actor: TrustedMutationActor,
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
    actor.actorUserId,
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
        createdById: actor.actorUserId,
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

  const postedTransaction = await databaseTransaction.inventoryTransaction.findUniqueOrThrow({
    where: { id: inventoryTransaction.id, companyId },
    include: inventoryTransactionInclude,
  });
  const action =
    input.type === 'PRODUCTION'
      ? 'inventory.production_posted'
      : input.type === 'REVERSAL'
        ? 'inventory.transaction_reversed'
        : 'inventory.transaction_posted';
  await recordMutationAuditEvent(
    databaseTransaction,
    companyId,
    actor,
    {
      action,
      resourceType: 'inventory_transaction',
      resourceId: postedTransaction.id,
      idempotencyMaterial: `inventory:${companyId}:${postingMetadata.idempotencyKey}`,
      metadata: { entryCount: postedTransaction.entries.length },
    },
    hooks,
  );
  return postedTransaction;
}

export async function postInventoryTransaction(
  companyId: string,
  input: PostInventoryTransactionInput,
  actor: TrustedMutationActor,
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
  if (actor.companyId !== companyId) {
    throw new ValidationError(
      'Posting user must belong to the same company',
      'INVALID_POSTING_USER',
    );
  }
  const payloadHash = hashInventoryPayload(input, actor.actorUserId);
  const postingMetadata = { idempotencyKey, payloadHash };
  const existingInventoryTransaction = await findIdempotentInventoryTransaction(
    companyId,
    idempotencyKey,
    payloadHash,
    databaseClient,
  );
  if (existingInventoryTransaction) return existingInventoryTransaction;

  try {
    return await withCompanyMutationTransaction(
      companyId,
      databaseClient,
      (databaseTransaction) =>
        executeInventoryPostingTransaction(
          companyId,
          input,
          postingMetadata,
          actor,
          options.hooks,
          databaseTransaction,
        ),
      { maxAttempts: options.maxAttempts, hooks: options.hooks },
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
    throw postingError;
  }
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
  actor: TrustedMutationActor,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const warehouse = await databaseTransaction.warehouse.create({
        data: {
          companyId,
          code: requiredText(input.code, 'code'),
          name: requiredText(input.name, 'name'),
          location: input.location?.trim() || null,
        },
      });
      await recordMutationAuditEvent(
        databaseTransaction,
        companyId,
        actor,
        {
          action: 'warehouse.created',
          resourceType: 'warehouse',
          resourceId: warehouse.id,
        },
        transactionOptions.auditHooks,
      );
      return warehouse;
    },
    transactionOptions,
  );
}

export async function updateWarehouse(
  companyId: string,
  warehouseId: string,
  input: { code?: string; name?: string; location?: string | null },
  actor: TrustedMutationActor,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const warehouse = await databaseTransaction.warehouse.findFirst({
        where: { id: warehouseId, companyId },
        select: { id: true },
      });
      if (!warehouse) throw new NotFoundError('Warehouse not found');
      const updatedWarehouse = await databaseTransaction.warehouse.update({
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
      await recordMutationAuditEvent(
        databaseTransaction,
        companyId,
        actor,
        {
          action: 'warehouse.updated',
          resourceType: 'warehouse',
          resourceId: updatedWarehouse.id,
        },
        transactionOptions.auditHooks,
      );
      return updatedWarehouse;
    },
    transactionOptions,
  );
}

export async function deactivateWarehouse(
  companyId: string,
  warehouseId: string,
  actor: TrustedMutationActor,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const warehouse = await databaseTransaction.warehouse.findFirst({
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
      const deactivatedWarehouse = await databaseTransaction.warehouse.update({
        where: { id: warehouseId, companyId },
        data: { active: false },
      });
      await recordMutationAuditEvent(
        databaseTransaction,
        companyId,
        actor,
        {
          action: 'warehouse.deactivated',
          resourceType: 'warehouse',
          resourceId: deactivatedWarehouse.id,
        },
        transactionOptions.auditHooks,
      );
      return deactivatedWarehouse;
    },
    transactionOptions,
  );
}

export async function updateSafetyQuantity(
  companyId: string,
  inventoryBalanceId: string,
  safetyQuantityValue: Quantity,
  actor: TrustedMutationActor,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
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
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const inventoryBalance = await databaseTransaction.inventoryBalance.findFirst({
        where: { id: inventoryBalanceId, companyId },
        select: { id: true },
      });
      if (!inventoryBalance)
        throw new NotFoundError('Inventory balance not found');
      const updatedBalance = await databaseTransaction.inventoryBalance.update({
        where: { id: inventoryBalanceId, companyId },
        data: { safetyQuantity },
      });
      await recordMutationAuditEvent(
        databaseTransaction,
        companyId,
        actor,
        {
          action: 'inventory.safety_quantity_updated',
          resourceType: 'inventory_balance',
          resourceId: updatedBalance.id,
        },
        transactionOptions.auditHooks,
      );
      return updatedBalance;
    },
    transactionOptions,
  );
}

export async function activateWarehouse(
  companyId: string,
  warehouseId: string,
  actor: TrustedMutationActor,
  databaseClient: PrismaClient = prisma,
  transactionOptions: CompanyMutationOptions = {},
) {
  return withCompanyMutationTransaction(
    companyId,
    databaseClient,
    async (databaseTransaction) => {
      const warehouse = await databaseTransaction.warehouse.findFirst({
        where: { id: warehouseId, companyId },
        select: { id: true },
      });
      if (!warehouse) throw new NotFoundError('Warehouse not found');
      const activatedWarehouse = await databaseTransaction.warehouse.update({
        where: { id: warehouseId, companyId },
        data: { active: true },
      });
      await recordMutationAuditEvent(
        databaseTransaction,
        companyId,
        actor,
        {
          action: 'warehouse.activated',
          resourceType: 'warehouse',
          resourceId: activatedWarehouse.id,
        },
        transactionOptions.auditHooks,
      );
      return activatedWarehouse;
    },
    transactionOptions,
  );
}

export type PostedInventoryTransaction = InventoryTransaction & {
  entries: { quantity: Prisma.Decimal }[];
};
