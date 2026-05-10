import { ModulePage } from '@/components/ModulePage';
import { UniErpAdminPage } from '@/components/UniErpAdminPage';
import { findUniErpMenuItem, getUniErpModule } from '@/lib/uniErpBlueprint';

type CollaborationPageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function CollaborationPage({ searchParams }: CollaborationPageProps) {
  const params = searchParams ? await searchParams : {};
  const adminPage = findUniErpMenuItem('/collaboration', params.legacy);
  const module = getUniErpModule('/collaboration');

  if (adminPage) return <UniErpAdminPage page={adminPage} />;

  return <ModulePage description={module!.description} eyebrow={module!.eyebrow} metrics={module!.metrics} sections={module!.sections} title={module!.title} />;
}
