import type { Metadata } from 'next';
import { AppSidebar } from '@/components/AppSidebar';
import './styles.css';

export const metadata: Metadata = {
  title: 'UniPlan AI ERP',
  description: 'AI-first ERP analyst prototype'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <main className="dashboard-shell">
          <AppSidebar />
          {children}
        </main>
      </body>
    </html>
  );
}
