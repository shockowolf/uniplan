import type { PostInventoryTransactionInput } from '@/lib/domain/inventory';
import {
  apiError,
  apiSuccess,
  optionalNullableString,
  optionalString,
  readJsonObject,
  requiredString,
} from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/domain/errors';
import { postInventoryTransaction } from '@/lib/domain/inventory';

const supportedTransactionTypes = [
  'RECEIPT',
  'ISSUE',
  'TRANSFER',
  'ADJUSTMENT',
  'PRODUCTION',
  'REVERSAL',
] as const;

type SupportedTransactionType = (typeof supportedTransactionTypes)[number];

function parseTransactionType(value: unknown): SupportedTransactionType {
  if (
    typeof value !== 'string' ||
    !supportedTransactionTypes.includes(value as SupportedTransactionType)
  ) {
    throw new ValidationError('type is required');
  }
  return value as SupportedTransactionType;
}

function parseQuantity(value: unknown, fieldName = 'quantity') {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ValidationError(`${fieldName} is required`);
  }
  return String(value);
}

function commonPostingFields(
  requestBody: Record<string, unknown>,
  createdById: string,
) {
  return {
    idempotencyKey: requiredString(requestBody.idempotencyKey, 'idempotencyKey'),
    occurredAt: optionalString(requestBody.occurredAt),
    reference: optionalNullableString(requestBody.reference),
    memo: optionalNullableString(requestBody.memo),
    createdById,
  };
}

function buildPostingInput(
  requestBody: Record<string, unknown>,
  createdById: string,
): PostInventoryTransactionInput {
  const transactionType = parseTransactionType(requestBody.type);
  const commonFields = commonPostingFields(requestBody, createdById);
  if (transactionType === 'PRODUCTION') {
    return {
      ...commonFields,
      type: transactionType,
      bomVersionId: requiredString(requestBody.bomVersionId, 'bomVersionId'),
      quantity: parseQuantity(requestBody.quantity),
      componentWarehouseId: requiredString(
        requestBody.componentWarehouseId,
        'componentWarehouseId',
      ),
      outputWarehouseId: requiredString(
        requestBody.outputWarehouseId,
        'outputWarehouseId',
      ),
    };
  }
  if (transactionType === 'REVERSAL') {
    return {
      ...commonFields,
      type: transactionType,
      originalTransactionId: requiredString(
        requestBody.originalTransactionId,
        'originalTransactionId',
      ),
    };
  }
  const itemId = requiredString(requestBody.itemId, 'itemId');
  if (transactionType === 'TRANSFER') {
    return {
      ...commonFields,
      type: transactionType,
      lines: [
        {
          itemId,
          fromWarehouseId: requiredString(
            requestBody.fromWarehouseId,
            'fromWarehouseId',
          ),
          toWarehouseId: requiredString(
            requestBody.toWarehouseId,
            'toWarehouseId',
          ),
          quantity: parseQuantity(requestBody.quantity),
        },
      ],
    };
  }
  const warehouseId = requiredString(requestBody.warehouseId, 'warehouseId');
  if (transactionType === 'ADJUSTMENT') {
    return {
      ...commonFields,
      type: transactionType,
      lines: [
        {
          itemId,
          warehouseId,
          quantityDelta: parseQuantity(
            requestBody.quantityDelta,
            'quantityDelta',
          ),
        },
      ],
    };
  }
  return {
    ...commonFields,
    type: transactionType,
    lines: [
      {
        itemId,
        warehouseId,
        quantity: parseQuantity(requestBody.quantity),
      },
    ],
  };
}

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.movements',
      'read',
    );
    const [inventoryTransactions, items, warehouses, activeBomVersions] =
      await Promise.all([
        prisma.inventoryTransaction.findMany({
          where: { companyId: sessionContext.companyId },
          include: {
            entries: {
              include: {
                item: { select: { id: true, code: true, name: true, unit: true } },
                warehouse: { select: { id: true, code: true, name: true } },
              },
              orderBy: { lineNumber: 'asc' },
            },
            reversal: { select: { id: true } },
            reversalOf: { select: { id: true } },
            bomVersion: {
              select: {
                id: true,
                revision: true,
                bom: { select: { code: true, name: true } },
              },
            },
          },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          take: 100,
        }),
        prisma.item.findMany({
          where: {
            companyId: sessionContext.companyId,
            active: true,
            trackInventory: true,
          },
          select: { id: true, code: true, name: true, unit: true },
          orderBy: { code: 'asc' },
        }),
        prisma.warehouse.findMany({
          where: { companyId: sessionContext.companyId, active: true },
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
        }),
        prisma.bomVersion.findMany({
          where: {
            status: 'ACTIVE',
            bom: { companyId: sessionContext.companyId, active: true },
          },
          select: {
            id: true,
            revision: true,
            bom: {
              select: {
                code: true,
                name: true,
                outputItem: { select: { code: true, name: true, unit: true } },
              },
            },
          },
          orderBy: { bom: { code: 'asc' } },
        }),
      ]);
    return apiSuccess({
      inventoryTransactions,
      items,
      warehouses,
      activeBomVersions,
    });
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function POST(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.movements',
      'create',
    );
    const requestBody = await readJsonObject(request);
    const inventoryTransaction = await postInventoryTransaction(
      sessionContext.companyId,
      buildPostingInput(requestBody, sessionContext.userId),
    );
    return apiSuccess({ inventoryTransaction }, 201);
  } catch (requestError) {
    return apiError(requestError, {
      INVALID_TRANSFER: 'toWarehouseId',
      INSUFFICIENT_STOCK: 'quantity',
    });
  }
}
