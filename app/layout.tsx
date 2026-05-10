import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'UniPlan AI ERP',
  description: 'AI-first ERP analyst prototype'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
