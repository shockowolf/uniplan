import type { PrismaClient } from '@prisma/client';
import { demoCompanyId, prisma } from '@/lib/db';
import { ForbiddenError } from '@/lib/domain/errors';

export type PermissionAction =
  'read' | 'create' | 'update' | 'delete' | 'admin';

const permissionColumnByAction = {
  read: 'canRead',
  create: 'canCreate',
  update: 'canUpdate',
  delete: 'canDelete',
  admin: 'canAdmin',
} as const;

export const demoIdentity = Object.freeze({
  companyId: demoCompanyId,
  email: 'admin@uniplan.local',
});

export function isDemoAuthenticationEnabled(
  environment: {
    NODE_ENV?: string;
    UNIPLAN_DEMO_AUTH_ENABLED?: string;
  } = process.env,
) {
  return (
    environment.NODE_ENV !== 'production' &&
    environment.UNIPLAN_DEMO_AUTH_ENABLED === 'true'
  );
}

export async function resolveDemoIdentity(
  databaseClient: PrismaClient = prisma,
) {
  if (!isDemoAuthenticationEnabled()) return null;
  return databaseClient.user.findFirst({
    where: {
      companyId: demoIdentity.companyId,
      email: demoIdentity.email,
      status: 'active',
      company: { id: demoIdentity.companyId, active: true },
    },
    select: { id: true, companyId: true, email: true, name: true },
  });
}

export async function hasPermission(
  input: {
    companyId: string;
    userId: string;
    resourceCode: string;
    action: PermissionAction;
  },
  databaseClient: PrismaClient = prisma,
) {
  try {
    const matchingPermission = await databaseClient.rolePermission.findFirst({
      where: {
        [permissionColumnByAction[input.action]]: true,
        menuItem: {
          companyId: input.companyId,
          resourceCode: input.resourceCode,
          active: true,
        },
        role: {
          companyId: input.companyId,
          active: true,
          userRoles: {
            some: {
              userId: input.userId,
              user: { companyId: input.companyId, status: 'active' },
            },
          },
        },
      },
      select: { id: true },
    });
    return matchingPermission !== null;
  } catch {
    return false;
  }
}

export async function requirePermission(
  input: {
    companyId: string;
    userId: string;
    resourceCode: string;
    action: PermissionAction;
  },
  databaseClient: PrismaClient = prisma,
) {
  if (!(await hasPermission(input, databaseClient))) throw new ForbiddenError();
}
