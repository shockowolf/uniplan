import {
  apiError,
  apiSuccess,
  readJsonObject,
  requiredString,
} from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/domain/errors';
import { updateSafetyQuantity } from '@/lib/domain/inventory';

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.stock',
      'read',
    );
    const inventoryBalances = await prisma.inventoryBalance.findMany({
      where: { companyId: sessionContext.companyId },
      include: {
        item: { select: { id: true, code: true, name: true, unit: true, active: true } },
        warehouse: { select: { id: true, code: true, name: true, active: true } },
      },
      orderBy: [{ warehouse: { code: 'asc' } }, { item: { code: 'asc' } }],
    });
    return apiSuccess({ inventoryBalances });
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'inventory.stock',
      'update',
    );
    const requestBody = await readJsonObject(request);
    if (
      typeof requestBody.safetyQuantity !== 'string' &&
      typeof requestBody.safetyQuantity !== 'number'
    ) {
      throw new ValidationError('safetyQuantity is required');
    }
    const inventoryBalance = await updateSafetyQuantity(
      sessionContext.companyId,
      requiredString(requestBody.id, 'id'),
      String(requestBody.safetyQuantity),
    );
    return apiSuccess({ inventoryBalance });
  } catch (requestError) {
    return apiError(requestError);
  }
}
