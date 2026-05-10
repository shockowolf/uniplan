import { demoCompanyId, prisma } from '@/lib/db';
import { uniErpModules } from '@/lib/uniErpBlueprint';

export type SidebarMenuItem = {
  label: string;
  href: string;
  children?: SidebarMenuItem[];
};

export const fallbackSidebarMenuItems: SidebarMenuItem[] = [
  ...uniErpModules.map((module) => ({
    label: module.label,
    href: module.href,
    children: module.children.map((item) => ({
      label: item.label,
      href: item.href
    }))
  }))
];

export async function getSidebarMenuItems(companyId = demoCompanyId, roleCode = 'admin'): Promise<SidebarMenuItem[]> {
  try {
    const role = await prisma.role.findFirst({
      where: {
        companyId,
        code: roleCode,
        active: true
      },
      select: { id: true }
    });

    const menuNodes = await prisma.menuNode.findMany({
      where: {
        companyId,
        active: true,
        parentId: null,
        ...(role
          ? {
              permissions: {
                some: {
                  roleId: role.id,
                  canRead: true
                }
              }
            }
          : {})
      },
      include: {
        menu: {
          select: {
            href: true,
            active: true
          }
        },
        children: {
          where: {
            active: true,
            ...(role
              ? {
                  permissions: {
                    some: {
                      roleId: role.id,
                      canRead: true
                    }
                  }
                }
              : {})
          },
          include: {
            menu: {
              select: {
                href: true,
                active: true
              }
            }
          },
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }]
        }
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }]
    });

    const items = menuNodes
      .filter((node) => node.menu?.active ?? true)
      .map((node) => ({
        label: node.label,
        href: node.href ?? node.menu?.href ?? '/',
        children: node.children
          .filter((child) => child.menu?.active ?? true)
          .map((child) => ({
            label: child.label,
            href: child.href ?? child.menu?.href ?? '/'
          }))
      }));

    return items.length > 0 ? items : fallbackSidebarMenuItems;
  } catch (error) {
    console.warn('Falling back to static sidebar menu:', error);
    return fallbackSidebarMenuItems;
  }
}
