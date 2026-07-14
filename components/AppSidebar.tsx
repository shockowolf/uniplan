'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { SidebarMenuItem } from '@/lib/navigation';

const examples = [
  { label: '매출 요약', text: '이번 달 매출 어때?' },
  { label: '지난달 비교', text: '지난달 매출 보여줘' },
  { label: '30일 매출', text: '최근 30일 매출' },
  { label: '미수금', text: '미수금 많은 거래처 TOP 10' },
  { label: '거래처 미수', text: '구리정밀 미수금 보여줘' },
  { label: '재고 위험', text: '재고 부족한 품목' },
  { label: '품목 재고', text: 'QR 주문 태블릿 재고 보여줘' },
  { label: '전체 현황', text: '오늘 사업 현황 요약' }
];

type AppSidebarProps = {
  menuItems: SidebarMenuItem[];
};

export function AppSidebar({ menuItems }: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
  const isActive = (href: string) => (href.includes('?') ? currentHref === href : pathname === href);
  const activeGroupKeys = useMemo(() => {
    const ancestorKeys: string[] = [];
    const findActiveBranch = (
      navigationItems: SidebarMenuItem[],
      ancestors: string[],
    ): boolean => {
      for (const navigationItem of navigationItems) {
        const navigationItemAncestors = navigationItem.children?.length
          ? [...ancestors, navigationItem.href]
          : ancestors;
        if (isActive(navigationItem.href)) {
          ancestorKeys.push(...navigationItemAncestors);
          return true;
        }
        if (
          navigationItem.children &&
          findActiveBranch(navigationItem.children, navigationItemAncestors)
        ) {
          return true;
        }
      }
      return false;
    };
    findActiveBranch(menuItems, []);
    return ancestorKeys;
  }, [currentHref, menuItems, pathname]);
  const [openGroupKeys, setOpenGroupKeys] = useState<ReadonlySet<string>>(
    () => new Set(activeGroupKeys),
  );

  useEffect(() => {
    setOpenGroupKeys((currentKeys) =>
      new Set([...currentKeys, ...activeGroupKeys]),
    );
  }, [activeGroupKeys]);

  const containsActiveItem = (navigationItem: SidebarMenuItem): boolean =>
    isActive(navigationItem.href) ||
    Boolean(navigationItem.children?.some(containsActiveItem));

  const toggleGroup = (groupKey: string) => {
    setOpenGroupKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(groupKey)) nextKeys.delete(groupKey);
      else nextKeys.add(groupKey);
      return nextKeys;
    });
  };

  const renderNavigationItems = (
    navigationItems: SidebarMenuItem[],
    depth = 0,
  ) =>
    navigationItems.map((item) => {
      const hasChildren = Boolean(item.children?.length);
      const isOpen = openGroupKeys.has(item.href);
      const itemActive = containsActiveItem(item);
      return (
        <div
          className={hasChildren ? 'nav-group' : undefined}
          key={`${item.href}-${item.label}`}
        >
          {hasChildren ? (
            <button
              aria-expanded={isOpen}
              className={
                itemActive
                  ? 'nav-link nav-toggle active'
                  : isOpen
                    ? 'nav-link nav-toggle open'
                    : 'nav-link nav-toggle'
              }
              onClick={() => toggleGroup(item.href)}
              style={{ paddingLeft: `${18 + depth * 10}px` }}
              type="button"
            >
              <span
                aria-hidden="true"
                className={isOpen ? 'nav-caret open' : 'nav-caret'}
              />
              <span className="nav-label">{item.label}</span>
            </button>
          ) : (
            <Link
              className={isActive(item.href) ? 'nav-link active' : 'nav-link'}
              href={item.href}
              style={{ paddingLeft: `${18 + depth * 10}px` }}
            >
              <span className="nav-label">{item.label}</span>
            </Link>
          )}
          {hasChildren && isOpen ? (
            <div className="nav-children">
              {renderNavigationItems(item.children ?? [], depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <aside className="app-sidebar">
      <Link aria-label="UNIPLAN 홈으로 이동" className="brand-block" href="/">
        <div className="brand-mark">U</div>
        <div>
          <div className="brand">UNIPLAN</div>
          <p>AI ERP</p>
        </div>
      </Link>

      <nav aria-label="주요 메뉴" className="nav-menu">
        {renderNavigationItems(menuItems)}
      </nav>

      <section className="scenario-box">
        <p className="eyebrow">Demo Questions</p>
        {examples.map((example) => (
          <Link className="scenario-link" href={`/?q=${encodeURIComponent(example.text)}`} key={example.text}>
            <span>{example.label}</span>
            {example.text}
          </Link>
        ))}
      </section>
    </aside>
  );
}
