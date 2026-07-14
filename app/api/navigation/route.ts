import { apiError, apiSuccess } from '@/lib/api/responses';
import { authorizeRequest } from '@/lib/auth/request';
import { getAuthorizedMenuTree } from '@/lib/navigation';

export async function GET(request: Request) {
  try {
    const sessionContext = await authorizeRequest(
      request,
      'dashboard.analytics',
      'read',
    );
    return apiSuccess({
      menuItems: await getAuthorizedMenuTree(
        sessionContext.companyId,
        sessionContext.userId,
      ),
    });
  } catch (requestError) {
    return apiError(requestError);
  }
}
