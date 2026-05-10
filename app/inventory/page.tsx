import { ModulePage } from '@/components/ModulePage';
import { UniErpAdminPage } from '@/components/UniErpAdminPage';
import { findUniErpMenuItem, getUniErpModule } from '@/lib/uniErpBlueprint';

type InventoryPageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const params = searchParams ? await searchParams : {};
  const adminPage = findUniErpMenuItem('/inventory', params.legacy);
  const module = getUniErpModule('/inventory');

  if (adminPage) return <UniErpAdminPage page={adminPage} />;

  return <ModulePage description={module!.description} eyebrow={module!.eyebrow} metrics={module!.metrics} sections={module!.sections} title={module!.title} />;
}
