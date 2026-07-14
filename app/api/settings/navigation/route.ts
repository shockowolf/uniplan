import {
  apiError,
  apiSuccess,
  optionalNullableString,
  optionalNumber,
  optionalString,
  readJsonObject,
  requiredString,
} from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { auditContextFromSession } from '@/lib/audit/service.server';
import { prisma } from '@/lib/db';
import {
  createNavigationMenuItem,
  activateNavigationMenuItem,
  deactivateNavigationMenuItem,
  updateNavigationMenuItem,
} from '@/lib/domain/navigation-settings';

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'settings.navigation',
      'read',
    );
    const menuItems = await prisma.menuItem.findMany({
      where: { companyId: sessionContext.companyId },
      include: { parent: { select: { id: true, label: true } } },
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    return apiSuccess({ menuItems });
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function POST(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'settings.navigation',
      'admin',
    );
    const requestBody = await readJsonObject(request);
    const menuItem = await createNavigationMenuItem(
      sessionContext.companyId,
      auditContextFromSession(sessionContext),
      {
        code: requiredString(requestBody.code, 'code'),
        label: requiredString(requestBody.label, 'label'),
        href: requiredString(requestBody.href, 'href'),
        resourceCode: requiredString(requestBody.resourceCode, 'resourceCode'),
        parentId: optionalNullableString(requestBody.parentId),
        sortOrder: optionalNumber(requestBody.sortOrder),
      },
    );
    return apiSuccess({ menuItem }, 201);
  } catch (requestError) {
    return apiError(requestError);
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'settings.navigation',
      'admin',
    );
    const requestBody = await readJsonObject(request);
    const menuItemId = requiredString(requestBody.id, 'id');
    const actor = auditContextFromSession(sessionContext);
    const menuItem =
      requestBody.action === 'deactivate'
        ? await deactivateNavigationMenuItem(
            sessionContext.companyId,
            menuItemId,
            actor,
          )
        : requestBody.action === 'activate'
          ? await activateNavigationMenuItem(
              sessionContext.companyId,
              menuItemId,
              actor,
            )
        : await updateNavigationMenuItem(
            sessionContext.companyId,
            menuItemId,
            {
              code: optionalString(requestBody.code),
              label: optionalString(requestBody.label),
              href: optionalString(requestBody.href),
              resourceCode: optionalString(requestBody.resourceCode),
              parentId: optionalNullableString(requestBody.parentId),
              sortOrder: optionalNumber(requestBody.sortOrder),
            },
            actor,
          );
    return apiSuccess({ menuItem });
  } catch (requestError) {
    return apiError(requestError);
  }
}
