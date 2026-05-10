import { ModulePage } from '@/components/ModulePage';
import { UniErpAdminPage } from '@/components/UniErpAdminPage';
import { findUniErpMenuItem, getUniErpModule } from '@/lib/uniErpBlueprint';

type FinancePageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const params = searchParams ? await searchParams : {};
  const adminPage = findUniErpMenuItem('/finance', params.legacy);
  const module = getUniErpModule('/finance');

  if (adminPage) return <UniErpAdminPage page={adminPage} />;

  return <ModulePage description={module!.description} eyebrow={module!.eyebrow} metrics={module!.metrics} sections={module!.sections} title={module!.title} />;
}
