import { ModulePage } from '@/components/ModulePage';
import { UniErpAdminPage } from '@/components/UniErpAdminPage';
import { findUniErpMenuItem, getUniErpModule } from '@/lib/uniErpBlueprint';

type OperationsPageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function OperationsPage({ searchParams }: OperationsPageProps) {
  const params = searchParams ? await searchParams : {};
  const adminPage = findUniErpMenuItem('/operations', params.legacy);
  const module = getUniErpModule('/operations');

  if (adminPage) return <UniErpAdminPage page={adminPage} />;

  return <ModulePage description={module!.description} eyebrow={module!.eyebrow} metrics={module!.metrics} sections={module!.sections} title={module!.title} />;
}
