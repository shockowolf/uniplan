import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { getSidebarMenuItems } from '@/lib/navigation';
import './styles.css';

export const metadata: Metadata = {
  title: 'UniPlan AI ERP',
  description: 'AI-first ERP analyst prototype'
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const menuItems = await getSidebarMenuItems();

  return (
    <html lang="ko">
      <body>
        <main className="dashboard-shell">
          <Suspense fallback={null}>
            <AppSidebar menuItems={menuItems} />
          </Suspense>
          {children}
        </main>
      </body>
    </html>
  );
}
