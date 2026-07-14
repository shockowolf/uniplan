import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isInternalMenuHref } from '@/lib/navigation';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/lib/domain/errors';

type NavigationMenuInput = {
  code: string;
  label: string;
  href: string;
  resourceCode: string;
  parentId?: string | null;
  sortOrder?: number;
};

function requiredText(value: string, fieldName: string) {
  const normalizedText = value.trim();
  if (!normalizedText) throw new ValidationError(`${fieldName} is required`);
  return normalizedText;
}

function validateHref(href: string) {
  const normalizedHref = requiredText(href, 'href');
  if (!isInternalMenuHref(normalizedHref)) {
    throw new ValidationError(
      'Navigation href must be an internal path',
      'INVALID_NAVIGATION_HREF',
    );
  }
  return normalizedHref;
}

function validateResourceCode(resourceCode: string) {
  const normalizedResourceCode = requiredText(resourceCode, 'resourceCode');
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(normalizedResourceCode)) {
    throw new ValidationError(
      'Resource code format is invalid',
      'INVALID_RESOURCE_CODE',
    );
  }
  return normalizedResourceCode;
}

async function requireValidParent(
  companyId: string,
  menuItemId: string | null,
  parentId: string | null | undefined,
  databaseClient: PrismaClient,
) {
  if (!parentId) return;
  if (parentId === menuItemId) {
    throw new ValidationError(
      'A navigation item cannot be its own parent',
      'NAVIGATION_CYCLE',
    );
  }
  let ancestorMenuItemId: string | null = parentId;
  while (ancestorMenuItemId) {
    const ancestorMenuItem: { id: string; parentId: string | null } | null =
      await databaseClient.menuItem.findFirst({
        where: { id: ancestorMenuItemId, companyId, active: true },
        select: { id: true, parentId: true },
      });
    if (!ancestorMenuItem) {
      throw new ValidationError(
        'Parent navigation item is unavailable',
        'INVALID_NAVIGATION_PARENT',
      );
    }
    if (ancestorMenuItem.parentId === menuItemId) {
      throw new ValidationError(
        'Navigation hierarchy cannot contain a cycle',
        'NAVIGATION_CYCLE',
      );
    }
    ancestorMenuItemId = ancestorMenuItem.parentId;
  }
}

export async function createNavigationMenuItem(
  companyId: string,
  administratorUserId: string,
  input: NavigationMenuInput,
  databaseClient: PrismaClient = prisma,
) {
  await requireValidParent(
    companyId,
    null,
    input.parentId,
    databaseClient,
  );
  return databaseClient.$transaction(async (databaseTransaction) => {
    const menuItem = await databaseTransaction.menuItem.create({
      data: {
        companyId,
        code: requiredText(input.code, 'code'),
        label: requiredText(input.label, 'label'),
        href: validateHref(input.href),
        resourceCode: validateResourceCode(input.resourceCode),
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    const administrativeRoles = await databaseTransaction.role.findMany({
      where: {
        companyId,
        active: true,
        userRoles: { some: { userId: administratorUserId } },
        permissions: {
          some: {
            canAdmin: true,
            menuItem: { companyId, resourceCode: 'settings.navigation' },
          },
        },
      },
      select: { id: true },
    });
    if (administrativeRoles.length === 0) {
      throw new ConflictError(
        'No administrative role is available for the new navigation item',
        'NAVIGATION_PERMISSION_MISSING',
      );
    }
    await databaseTransaction.rolePermission.createMany({
      data: administrativeRoles.map((role) => ({
        roleId: role.id,
        menuItemId: menuItem.id,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canAdmin: true,
      })),
    });
    return menuItem;
  });
}

export async function updateNavigationMenuItem(
  companyId: string,
  menuItemId: string,
  input: Partial<NavigationMenuInput>,
  databaseClient: PrismaClient = prisma,
) {
  const existingMenuItem = await databaseClient.menuItem.findFirst({
    where: { id: menuItemId, companyId },
    select: { id: true },
  });
  if (!existingMenuItem) throw new NotFoundError('Navigation item not found');
  if (input.parentId !== undefined) {
    await requireValidParent(
      companyId,
      menuItemId,
      input.parentId,
      databaseClient,
    );
  }
  return databaseClient.menuItem.update({
    where: { id: menuItemId, companyId },
    data: {
      ...(input.code !== undefined
        ? { code: requiredText(input.code, 'code') }
        : {}),
      ...(input.label !== undefined
        ? { label: requiredText(input.label, 'label') }
        : {}),
      ...(input.href !== undefined ? { href: validateHref(input.href) } : {}),
      ...(input.resourceCode !== undefined
        ? { resourceCode: validateResourceCode(input.resourceCode) }
        : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deactivateNavigationMenuItem(
  companyId: string,
  menuItemId: string,
  databaseClient: PrismaClient = prisma,
) {
  const existingMenuItem = await databaseClient.menuItem.findFirst({
    where: { id: menuItemId, companyId },
    select: {
      id: true,
      children: { where: { active: true }, select: { id: true }, take: 1 },
    },
  });
  if (!existingMenuItem) throw new NotFoundError('Navigation item not found');
  if (existingMenuItem.children.length > 0) {
    throw new ConflictError(
      'Navigation items with active children cannot be deactivated',
      'NAVIGATION_HAS_CHILDREN',
    );
  }
  return databaseClient.menuItem.update({
    where: { id: menuItemId, companyId },
    data: { active: false },
  });
}
