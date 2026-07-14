import {
  apiError,
  apiSuccess,
  optionalNullableString,
  optionalString,
  readJsonObject,
  requiredString,
} from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { auditContextFromSession } from '@/lib/audit/service.server';
import { prisma } from '@/lib/db';
import {
  activateBomRevision,
  activateBom,
  createBom,
  createDraftBomRevision,
  deactivateBom,
  explodeBomRevision,
  replaceDraftBomComponents,
  retireBomRevision,
  updateBom,
} from '@/lib/domain/boms';
import { ValidationError } from '@/lib/domain/errors';

function parseComponents(value: unknown) {
  if (!Array.isArray(value)) throw new ValidationError('components is required');
  return value.map((componentValue, componentIndex) => {
    if (!componentValue || typeof componentValue !== 'object') {
      throw new ValidationError('components is required');
    }
    const component = componentValue as Record<string, unknown>;
    const quantity = component.quantity;
    if (typeof quantity !== 'string' && typeof quantity !== 'number') {
      throw new ValidationError('components is required');
    }
    return {
      itemId: requiredString(component.itemId, 'components'),
      quantity: String(quantity),
      sortOrder:
        typeof component.sortOrder === 'number'
          ? component.sortOrder
          : componentIndex,
    };
  });
}

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.boms',
      'read',
    );
    const requestUrl = new URL(request.url);
    const bomVersionId = requestUrl.searchParams.get('versionId');
    if (bomVersionId) {
      const outputQuantity = requestUrl.searchParams.get('quantity') ?? '1';
      const explodedComponents = await explodeBomRevision(
        sessionContext.companyId,
        bomVersionId,
        outputQuantity,
      );
      return apiSuccess({ explodedComponents });
    }
    const [boms, items] = await Promise.all([
      prisma.bom.findMany({
        where: { companyId: sessionContext.companyId },
        include: {
          outputItem: { select: { id: true, code: true, name: true, unit: true } },
          versions: {
            include: {
              components: {
                include: {
                  componentItem: {
                    select: { id: true, code: true, name: true, unit: true },
                  },
                  childBomVersion: {
                    select: {
                      id: true,
                      revision: true,
                      bom: { select: { code: true, name: true } },
                    },
                  },
                },
                orderBy: [{ sortOrder: 'asc' }, { componentItemId: 'asc' }],
              },
            },
            orderBy: { revision: 'desc' },
          },
        },
        orderBy: [{ active: 'desc' }, { code: 'asc' }],
      }),
      prisma.item.findMany({
        where: {
          companyId: sessionContext.companyId,
          active: true,
          trackInventory: true,
        },
        select: { id: true, code: true, name: true, itemType: true, unit: true },
        orderBy: { code: 'asc' },
      }),
    ]);
    return apiSuccess({ boms, items });
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function POST(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.boms',
      'create',
    );
    const requestBody = await readJsonObject(request);
    const actor = auditContextFromSession(sessionContext);
    if (requestBody.action === 'draftRevision') {
      const bomVersion = await createDraftBomRevision(
        sessionContext.companyId,
        requiredString(requestBody.bomId, 'bomId'),
        actor,
        optionalNullableString(requestBody.notes),
      );
      return apiSuccess({ bomVersion }, 201);
    }
    const bom = await createBom(sessionContext.companyId, {
      code: requiredString(requestBody.code, 'code'),
      name: requiredString(requestBody.name, 'name'),
      outputItemId: requiredString(requestBody.outputItemId, 'outputItemId'),
      notes: optionalNullableString(requestBody.notes),
    }, actor);
    return apiSuccess({ bom }, 201);
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function PATCH(request: Request) {
  try {
    let requestBody: Record<string, unknown> | undefined;
    const sessionContext = await authorizeRequest(
      request,
      'inventory.boms',
      async () => {
        requestBody = await readJsonObject(request);
        return requestBody.action === 'deactivate' ? 'delete' : 'update';
      },
    );
    if (!requestBody) throw new Error('Authorized request body is unavailable');
    const action = optionalString(requestBody.action) ?? 'update';
    const actor = auditContextFromSession(sessionContext);
    const isDeactivation = action === 'deactivate';
    if (action === 'components') {
      const bomVersion = await replaceDraftBomComponents(
        sessionContext.companyId,
        requiredString(requestBody.versionId, 'versionId'),
        parseComponents(requestBody.components),
        actor,
      );
      return apiSuccess({ bomVersion });
    }
    if (action === 'activate') {
      const bomVersion = await activateBomRevision(
        sessionContext.companyId,
        requiredString(requestBody.versionId, 'versionId'),
        actor,
      );
      return apiSuccess({ bomVersion });
    }
    if (action === 'retire') {
      const bomVersion = await retireBomRevision(
        sessionContext.companyId,
        requiredString(requestBody.versionId, 'versionId'),
        actor,
      );
      return apiSuccess({ bomVersion });
    }
    const bomId = requiredString(requestBody.bomId, 'bomId');
    if (isDeactivation) {
      const bom = await deactivateBom(sessionContext.companyId, bomId, actor);
      return apiSuccess({ bom });
    }
    if (action === 'activateBom') {
      const bom = await activateBom(sessionContext.companyId, bomId, actor);
      return apiSuccess({ bom });
    }
    const bom = await updateBom(sessionContext.companyId, bomId, {
      code: optionalString(requestBody.code),
      name: optionalString(requestBody.name),
    }, actor);
    return apiSuccess({ bom });
  } catch (requestError) {
    return apiError(requestError);
  }
}
