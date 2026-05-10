import { ModulePage } from '@/components/ModulePage';
import { UniErpAdminPage } from '@/components/UniErpAdminPage';
import { findUniErpMenuItem, getUniErpModule } from '@/lib/uniErpBlueprint';

type CommercePageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function CommercePage({ searchParams }: CommercePageProps) {
  const params = searchParams ? await searchParams : {};
  const adminPage = findUniErpMenuItem('/commerce', params.legacy);
  const module = getUniErpModule('/commerce');

  if (adminPage) return <UniErpAdminPage page={adminPage} />;

  return <ModulePage description={module!.description} eyebrow={module!.eyebrow} metrics={module!.metrics} sections={module!.sections} title={module!.title} />;
}
