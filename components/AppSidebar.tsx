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
  { label: '상품 재고', text: 'QR 주문 태블릿 재고 보여줘' },
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
  const activeGroupKey = useMemo(
    () =>
      menuItems.find((item) => {
        const childActive = item.children?.some((child) => isActive(child.href)) ?? false;
        return Boolean(item.children?.length) && (isActive(item.href) || childActive);
      })?.href ?? null,
    [currentHref, menuItems, pathname]
  );
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(activeGroupKey);

  useEffect(() => {
    setOpenGroupKey(activeGroupKey);
  }, [activeGroupKey]);

  return (
    <aside className="app-sidebar">
      <Link aria-label="UniPlan 홈으로 이동" className="brand-block" href="/">
        <div className="brand-mark">U</div>
        <div>
          <div className="brand">UniPlan</div>
          <p>AI ERP</p>
        </div>
      </Link>

      <nav aria-label="주요 메뉴" className="nav-menu">
        {menuItems.map((item) => {
          const hasChildren = Boolean(item.children?.length);
          const childActive = item.children?.some((child) => isActive(child.href)) ?? false;
          const isOpen = openGroupKey === item.href;

          return (
            <div className={hasChildren ? 'nav-group' : undefined} key={`${item.href}-${item.label}`}>
              {hasChildren ? (
                <button
                  aria-expanded={isOpen}
                  className={isActive(item.href) || childActive || isOpen ? 'nav-link nav-toggle active' : 'nav-link nav-toggle'}
                  onClick={() => setOpenGroupKey(isOpen ? null : item.href)}
                  type="button"
                >
                  <span className="nav-label">{item.label}</span>
                  <span aria-hidden="true" className={isOpen ? 'nav-caret open' : 'nav-caret'} />
                </button>
              ) : (
                <Link className={isActive(item.href) ? 'nav-link active' : 'nav-link'} href={item.href}>
                  <span className="nav-label">{item.label}</span>
                </Link>
              )}
              {hasChildren && isOpen ? (
                <div className="nav-children">
                  {item.children?.map((child) => (
                    <Link className={isActive(child.href) ? 'nav-link nav-child active' : 'nav-link nav-child'} href={child.href} key={`${child.href}-${child.label}`}>
                      <span className="nav-label">{child.label}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
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
