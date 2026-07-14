import { resolveRequestSession } from '@/lib/auth/request';

export async function GET(request: Request) {
  const sessionContext = await resolveRequestSession(request);
  if (!sessionContext) {
    return Response.json(
      { authenticated: false },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json(
    {
      authenticated: true,
      user: {
        id: sessionContext.userId,
        companyId: sessionContext.companyId,
        companyCode: sessionContext.companyCode,
        companyName: sessionContext.companyName,
        email: sessionContext.email,
        name: sessionContext.name,
      },
      expiresAt: sessionContext.expiresAt.toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
