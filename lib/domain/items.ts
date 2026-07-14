import { ItemType, Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/domain/errors';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export type ItemInput = {
  code: string;
  name: string;
  itemType: ItemType;
  categoryId?: string | null;
  unit?: string;
  standardPrice?: Prisma.Decimal.Value;
  costPrice?: Prisma.Decimal.Value;
  trackInventory?: boolean;
  taxable?: boolean;
  description?: string | null;
  memo?: string | null;
};

function normalizeRequiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new ValidationError(`${field} is required`);
  return normalized;
}

function validateItemType(itemType: ItemType, trackInventory: boolean) {
  if (itemType === ItemType.SERVICE && trackInventory) {
    throw new ValidationError(
      'Service items cannot track inventory',
      'SERVICE_INVENTORY_NOT_ALLOWED',
    );
  }
}

function nonnegativeMoney(value: Prisma.Decimal.Value, field: string) {
  try {
    const moneyValue = new Prisma.Decimal(value);
    if (moneyValue.isNegative())
      throw new ValidationError(`${field} cannot be negative`);
    return moneyValue;
  } catch (moneyError) {
    if (moneyError instanceof ValidationError) throw moneyError;
    throw new ValidationError(`${field} is invalid`);
  }
}

async function requireActiveItemCategory(
  companyId: string,
  categoryId: string | null | undefined,
  databaseClient: DatabaseClient,
) {
  if (!categoryId) return;
  const activeItemCategory = await databaseClient.itemCategory.findFirst({
    where: { id: categoryId, companyId, active: true },
    select: { id: true },
  });
  if (!activeItemCategory) {
    throw new ValidationError(
      'Category must be active and belong to the same company',
      'INVALID_ITEM_CATEGORY',
    );
  }
}

export async function createItem(
  companyId: string,
  input: ItemInput,
  databaseClient: DatabaseClient = prisma,
) {
  const trackInventory =
    input.trackInventory ?? input.itemType !== ItemType.SERVICE;
  validateItemType(input.itemType, trackInventory);
  await requireActiveItemCategory(companyId, input.categoryId, databaseClient);

  return databaseClient.item.create({
    data: {
      companyId,
      code: normalizeRequiredText(input.code, 'code'),
      name: normalizeRequiredText(input.name, 'name'),
      itemType: input.itemType,
      categoryId: input.categoryId ?? null,
      unit: normalizeRequiredText(input.unit ?? 'ea', 'unit'),
      standardPrice: nonnegativeMoney(input.standardPrice ?? 0, 'standardPrice'),
      costPrice: nonnegativeMoney(input.costPrice ?? 0, 'costPrice'),
      trackInventory,
      taxable: input.taxable ?? true,
      description: input.description?.trim() || null,
      memo: input.memo?.trim() || null,
    },
  });
}

export async function updateItem(
  companyId: string,
  itemId: string,
  input: Partial<ItemInput>,
  databaseClient: DatabaseClient = prisma,
) {
  const existingItem = await databaseClient.item.findFirst({
    where: { id: itemId, companyId },
    select: {
      itemType: true,
      trackInventory: true,
      _count: { select: { inventoryEntries: true, bomComponents: true } },
      outputBom: { select: { id: true } },
    },
  });
  if (!existingItem) throw new NotFoundError('Item not found');

  const itemType = input.itemType ?? existingItem.itemType;
  const trackInventory = input.trackInventory ?? existingItem.trackInventory;
  validateItemType(itemType, trackInventory);
  await requireActiveItemCategory(companyId, input.categoryId, databaseClient);
  if (
    (itemType !== existingItem.itemType ||
      trackInventory !== existingItem.trackInventory) &&
    (existingItem._count.inventoryEntries > 0 ||
      existingItem._count.bomComponents > 0 ||
      existingItem.outputBom)
  ) {
    throw new ConflictError(
      'Inventory or BOM usage prevents changing item inventory semantics',
      'ITEM_SEMANTICS_IN_USE',
    );
  }

  return databaseClient.item.update({
    where: { id: itemId, companyId },
    data: {
      ...(input.code !== undefined
        ? { code: normalizeRequiredText(input.code, 'code') }
        : {}),
      ...(input.name !== undefined
        ? { name: normalizeRequiredText(input.name, 'name') }
        : {}),
      ...(input.itemType !== undefined ? { itemType } : {}),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.unit !== undefined
        ? { unit: normalizeRequiredText(input.unit, 'unit') }
        : {}),
      ...(input.standardPrice !== undefined
        ? { standardPrice: nonnegativeMoney(input.standardPrice, 'standardPrice') }
        : {}),
      ...(input.costPrice !== undefined
        ? { costPrice: nonnegativeMoney(input.costPrice, 'costPrice') }
        : {}),
      ...(input.trackInventory !== undefined ? { trackInventory } : {}),
      ...(input.taxable !== undefined ? { taxable: input.taxable } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.memo !== undefined ? { memo: input.memo?.trim() || null } : {}),
    },
  });
}

export async function deactivateItem(
  companyId: string,
  itemId: string,
  databaseClient: DatabaseClient = prisma,
) {
  const existingItem = await databaseClient.item.findFirst({
    where: { id: itemId, companyId },
    select: {
      id: true,
      inventoryBalances: {
        where: { quantity: { not: 0 } },
        select: { id: true },
        take: 1,
      },
      outputBom: {
        select: {
          versions: {
            where: { status: 'ACTIVE' },
            select: { id: true },
            take: 1,
          },
        },
      },
      bomComponents: {
        where: { bomVersion: { status: 'ACTIVE' } },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!existingItem) throw new NotFoundError('Item not found');
  if (existingItem.inventoryBalances.length > 0)
    throw new ConflictError(
      'Item with on-hand inventory cannot be deactivated',
      'ITEM_HAS_STOCK',
    );
  if (
    (existingItem.outputBom?.versions.length ?? 0) > 0 ||
    existingItem.bomComponents.length > 0
  ) {
    throw new ConflictError(
      'Item used by an active BOM cannot be deactivated',
      'ITEM_USED_BY_ACTIVE_BOM',
    );
  }
  return databaseClient.item.update({
    where: { id: itemId, companyId },
    data: { active: false },
  });
}

export async function createItemCategory(
  companyId: string,
  input: {
    code: string;
    name: string;
    parentId?: string | null;
    description?: string | null;
  },
  databaseClient: DatabaseClient = prisma,
) {
  if (input.parentId) {
    const parentItemCategory = await databaseClient.itemCategory.findFirst({
      where: { id: input.parentId, companyId, active: true },
      select: { id: true },
    });
    if (!parentItemCategory) {
      throw new ValidationError(
        'Parent category must be active and belong to the same company',
        'INVALID_PARENT_CATEGORY',
      );
    }
  }
  return databaseClient.itemCategory.create({
    data: {
      companyId,
      code: normalizeRequiredText(input.code, 'code'),
      name: normalizeRequiredText(input.name, 'name'),
      parentId: input.parentId ?? null,
      description: input.description?.trim() || null,
    },
  });
}

export async function deactivateItemCategory(
  companyId: string,
  categoryId: string,
  databaseClient: DatabaseClient = prisma,
) {
  const itemCategory = await databaseClient.itemCategory.findFirst({
    where: { id: categoryId, companyId },
    select: {
      id: true,
      items: { where: { active: true }, select: { id: true }, take: 1 },
      children: { where: { active: true }, select: { id: true }, take: 1 },
    },
  });
  if (!itemCategory) throw new NotFoundError('Item category not found');
  if (itemCategory.items.length > 0 || itemCategory.children.length > 0) {
    throw new ConflictError(
      'Non-empty item categories cannot be deactivated',
      'ITEM_CATEGORY_NOT_EMPTY',
    );
  }
  return databaseClient.itemCategory.update({
    where: { id: categoryId, companyId },
    data: { active: false },
  });
}

export async function updateItemCategory(
  companyId: string,
  categoryId: string,
  input: {
    code?: string;
    name?: string;
    parentId?: string | null;
    description?: string | null;
  },
  databaseClient: DatabaseClient = prisma,
) {
  const existingItemCategory = await databaseClient.itemCategory.findFirst({
    where: { id: categoryId, companyId },
    select: { id: true },
  });
  if (!existingItemCategory) throw new NotFoundError('Item category not found');
  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === categoryId)
      throw new ValidationError(
        'An item category cannot be its own parent',
        'ITEM_CATEGORY_CYCLE',
      );
    let ancestorCategoryId: string | null = input.parentId;
    while (ancestorCategoryId) {
      const ancestorCategory: { id: string; parentId: string | null } | null =
        await databaseClient.itemCategory.findFirst({
          where: { id: ancestorCategoryId, companyId, active: true },
          select: { id: true, parentId: true },
        });
      if (!ancestorCategory) {
        throw new ValidationError(
          'Parent category must be active and belong to the same company',
          'INVALID_PARENT_CATEGORY',
        );
      }
      if (ancestorCategory.parentId === categoryId) {
        throw new ValidationError(
          'Item category hierarchy cannot contain a cycle',
          'ITEM_CATEGORY_CYCLE',
        );
      }
      ancestorCategoryId = ancestorCategory.parentId;
    }
  }
  return databaseClient.itemCategory.update({
    where: { id: categoryId, companyId },
    data: {
      ...(input.code !== undefined
        ? { code: normalizeRequiredText(input.code, 'code') }
        : {}),
      ...(input.name !== undefined
        ? { name: normalizeRequiredText(input.name, 'name') }
        : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
    },
  });
}
