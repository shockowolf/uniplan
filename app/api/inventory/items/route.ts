import { ItemType } from '@prisma/client';
import {
  apiError,
  apiSuccess,
  optionalBoolean,
  optionalNullableString,
  optionalString,
  readJsonObject,
  requiredString,
} from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/domain/errors';
import {
  createItem,
  createItemCategory,
  deactivateItem,
  deactivateItemCategory,
  updateItem,
  updateItemCategory,
} from '@/lib/domain/items';

function parseItemType(value: unknown) {
  if (
    typeof value !== 'string' ||
    !Object.values(ItemType).includes(value as ItemType)
  ) {
    throw new ValidationError('itemType is required');
  }
  return value as ItemType;
}

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.items',
      'read',
    );
    const [items, categories] = await Promise.all([
      prisma.item.findMany({
        where: { companyId: sessionContext.companyId },
        include: { category: { select: { id: true, code: true, name: true } } },
        orderBy: [{ active: 'desc' }, { code: 'asc' }],
      }),
      prisma.itemCategory.findMany({
        where: { companyId: sessionContext.companyId },
        include: { parent: { select: { id: true, name: true } } },
        orderBy: [{ active: 'desc' }, { code: 'asc' }],
      }),
    ]);
    return apiSuccess({ items, categories });
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function POST(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.items',
      'create',
    );
    const requestBody = await readJsonObject(request);
    if (requestBody.kind === 'category') {
      const category = await createItemCategory(sessionContext.companyId, {
        code: requiredString(requestBody.code, 'code'),
        name: requiredString(requestBody.name, 'name'),
        parentId: optionalNullableString(requestBody.parentId),
        description: optionalNullableString(requestBody.description),
      });
      return apiSuccess({ category }, 201);
    }
    const itemType = parseItemType(requestBody.itemType);
    const item = await createItem(sessionContext.companyId, {
      code: requiredString(requestBody.code, 'code'),
      name: requiredString(requestBody.name, 'name'),
      itemType,
      categoryId: optionalNullableString(requestBody.categoryId),
      unit: optionalString(requestBody.unit),
      standardPrice: optionalString(requestBody.standardPrice),
      costPrice: optionalString(requestBody.costPrice),
      trackInventory: optionalBoolean(requestBody.trackInventory),
      taxable: optionalBoolean(requestBody.taxable),
      description: optionalNullableString(requestBody.description),
      memo: optionalNullableString(requestBody.memo),
    });
    return apiSuccess({ item }, 201);
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function PATCH(request: Request) {
  try {
    let requestBody: Record<string, unknown> | undefined;
    const sessionContext = await authorizeRequest(
      request,
      'inventory.items',
      async () => {
        requestBody = await readJsonObject(request);
        return requestBody.action === 'deactivate' ? 'delete' : 'update';
      },
    );
    if (!requestBody) throw new Error('Authorized request body is unavailable');
    const itemId = requiredString(requestBody.id, 'id');
    const isDeactivation = requestBody.action === 'deactivate';
    if (requestBody.kind === 'category') {
      if (isDeactivation) {
        const category = await deactivateItemCategory(
          sessionContext.companyId,
          itemId,
        );
        return apiSuccess({ category });
      }
      const category = await updateItemCategory(
        sessionContext.companyId,
        itemId,
        {
          code: optionalString(requestBody.code),
          name: optionalString(requestBody.name),
          parentId: optionalNullableString(requestBody.parentId),
          description: optionalNullableString(requestBody.description),
        },
      );
      return apiSuccess({ category });
    }
    if (isDeactivation) {
      const item = await deactivateItem(sessionContext.companyId, itemId);
      return apiSuccess({ item });
    }
    const itemType =
      requestBody.itemType === undefined
        ? undefined
        : parseItemType(requestBody.itemType);
    const item = await updateItem(sessionContext.companyId, itemId, {
      code: optionalString(requestBody.code),
      name: optionalString(requestBody.name),
      itemType,
      categoryId: optionalNullableString(requestBody.categoryId),
      unit: optionalString(requestBody.unit),
      standardPrice: optionalString(requestBody.standardPrice),
      costPrice: optionalString(requestBody.costPrice),
      trackInventory: optionalBoolean(requestBody.trackInventory),
      taxable: optionalBoolean(requestBody.taxable),
      description: optionalNullableString(requestBody.description),
      memo: optionalNullableString(requestBody.memo),
    });
    return apiSuccess({ item });
  } catch (requestError) {
    return apiError(requestError);
  }
}
