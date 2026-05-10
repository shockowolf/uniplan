'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const menuItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Sales', href: '/sales' },
  { label: 'Customers', href: '/customers' },
  { label: 'Inventory', href: '/inventory' },
  { label: 'Finance', href: '/finance' },
  { label: 'Operations', href: '/operations' }
];

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

export function AppSidebar() {
  const pathname = usePathname();

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
        {menuItems.map((item) => (
          <Link className={pathname === item.href ? 'nav-link active' : 'nav-link'} href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
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
