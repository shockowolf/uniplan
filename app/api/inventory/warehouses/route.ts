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
  createWarehouse,
  activateWarehouse,
  deactivateWarehouse,
  updateWarehouse,
} from '@/lib/domain/inventory';

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.warehouses',
      'read',
    );
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: sessionContext.companyId },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
    });
    return apiSuccess({ warehouses });
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function POST(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.warehouses',
      'create',
    );
    const requestBody = await readJsonObject(request);
    const actor = auditContextFromSession(sessionContext);
    const warehouse = await createWarehouse(sessionContext.companyId, {
      code: requiredString(requestBody.code, 'code'),
      name: requiredString(requestBody.name, 'name'),
      location: optionalNullableString(requestBody.location),
    }, actor);
    return apiSuccess({ warehouse }, 201);
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function PATCH(request: Request) {
  try {
    let requestBody: Record<string, unknown> | undefined;
    const sessionContext = await authorizeRequest(
      request,
      'inventory.warehouses',
      async () => {
        requestBody = await readJsonObject(request);
        return requestBody.action === 'deactivate' ? 'delete' : 'update';
      },
    );
    if (!requestBody) throw new Error('Authorized request body is unavailable');
    const warehouseId = requiredString(requestBody.id, 'id');
    const isDeactivation = requestBody.action === 'deactivate';
    const isActivation = requestBody.action === 'activate';
    const actor = auditContextFromSession(sessionContext);
    const warehouse = isDeactivation
      ? await deactivateWarehouse(sessionContext.companyId, warehouseId, actor)
      : isActivation
        ? await activateWarehouse(sessionContext.companyId, warehouseId, actor)
      : await updateWarehouse(sessionContext.companyId, warehouseId, {
          code: optionalString(requestBody.code),
          name: optionalString(requestBody.name),
          location: optionalNullableString(requestBody.location),
        }, actor);
    return apiSuccess({ warehouse });
  } catch (requestError) {
    return apiError(requestError);
  }
}
