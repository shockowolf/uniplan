import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';

export type SidebarMenuItem = {
  code: string;
  label: string;
  href: string;
  children?: SidebarMenuItem[];
};

type VisibleMenuRow = {
  id: string;
  parentId: string | null;
  code: string;
  label: string;
  href: string | null;
  sortOrder: number;
};

export function isInternalMenuHref(href: string | null): href is string {
  return Boolean(
    href &&
    href.startsWith('/') &&
    !href.startsWith('//') &&
    !href.includes('://') &&
    !/\s/.test(href),
  );
}

export function buildMenuTree(
  menuRecords: VisibleMenuRow[],
): SidebarMenuItem[] {
  const validMenuRecords = menuRecords.filter((menuRecord) =>
    isInternalMenuHref(menuRecord.href),
  );
  const menuRecordsByParentId = new Map<string | null, VisibleMenuRow[]>();
  for (const menuRecord of validMenuRecords) {
    const siblingMenuRecords =
      menuRecordsByParentId.get(menuRecord.parentId) ?? [];
    siblingMenuRecords.push(menuRecord);
    menuRecordsByParentId.set(menuRecord.parentId, siblingMenuRecords);
  }

  const compareMenuRecords = (left: VisibleMenuRow, right: VisibleMenuRow) =>
    left.sortOrder - right.sortOrder ||
    left.label.localeCompare(right.label) ||
    left.code.localeCompare(right.code);

  const buildChildMenuItems = (
    parentId: string | null,
    ancestorMenuIds: ReadonlySet<string>,
  ): SidebarMenuItem[] =>
    (menuRecordsByParentId.get(parentId) ?? [])
      .sort(compareMenuRecords)
      .filter((menuRecord) => !ancestorMenuIds.has(menuRecord.id))
      .map((menuRecord) => {
        const descendantAncestorMenuIds = new Set(ancestorMenuIds).add(
          menuRecord.id,
        );
        const childMenuItems = buildChildMenuItems(
          menuRecord.id,
          descendantAncestorMenuIds,
        );
        return {
          code: menuRecord.code,
          label: menuRecord.label,
          href: menuRecord.href as string,
          ...(childMenuItems.length > 0 ? { children: childMenuItems } : {}),
        };
      });

  return buildChildMenuItems(null, new Set());
}

export async function getAuthorizedMenuTree(
  companyId: string,
  userId: string,
  databaseClient: PrismaClient = prisma,
): Promise<SidebarMenuItem[]> {
  try {
    const authorizedMenuRecords = await databaseClient.menuItem.findMany({
      where: {
        companyId,
        active: true,
        permissions: {
          some: {
            canRead: true,
            role: {
              companyId,
              active: true,
              userRoles: {
                some: { userId, user: { companyId, status: 'active' } },
              },
            },
          },
        },
      },
      select: {
        id: true,
        parentId: true,
        code: true,
        label: true,
        href: true,
        sortOrder: true,
      },
    });
    return buildMenuTree(authorizedMenuRecords);
  } catch {
    return [];
  }
}

export async function getSidebarMenuItems(
  companyId: string,
  userId: string,
  databaseClient: PrismaClient = prisma,
): Promise<SidebarMenuItem[]> {
  return getAuthorizedMenuTree(companyId, userId, databaseClient);
}
