import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import {
  isDemoAuthenticationEnabled,
  resolveDemoIdentity,
} from '@/lib/auth/permissions';
import {
  resolveSessionToken,
  SESSION_COOKIE_NAME,
} from '@/lib/auth/session';
import { getSidebarMenuItems } from '@/lib/navigation';
import './styles.css';

export const metadata: Metadata = {
  title: 'UNIPLAN AI ERP',
  description: 'AI-first ERP analyst prototype'
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const sessionCookies = cookieStore.getAll(SESSION_COOKIE_NAME);
  const sessionContext =
    sessionCookies.length === 1
      ? await resolveSessionToken(sessionCookies[0].value)
      : null;
  const localDemoIdentity =
    sessionCookies.length === 0 && isDemoAuthenticationEnabled()
      ? await resolveDemoIdentity()
      : null;
  const menuIdentity = sessionContext
    ? { companyId: sessionContext.companyId, userId: sessionContext.userId }
    : localDemoIdentity
      ? { companyId: localDemoIdentity.companyId, userId: localDemoIdentity.id }
      : null;
  const menuItems = menuIdentity
    ? await getSidebarMenuItems(menuIdentity.companyId, menuIdentity.userId)
    : [];

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
