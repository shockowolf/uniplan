import { ModulePage } from '@/components/ModulePage';
import { UniErpAdminPage } from '@/components/UniErpAdminPage';
import { findUniErpMenuItem, getUniErpModule } from '@/lib/uniErpBlueprint';

type AutomationPageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function AutomationPage({ searchParams }: AutomationPageProps) {
  const params = searchParams ? await searchParams : {};
  const adminPage = findUniErpMenuItem('/automation', params.legacy);
  const module = getUniErpModule('/automation');

  if (adminPage) return <UniErpAdminPage page={adminPage} />;

  return <ModulePage description={module!.description} eyebrow={module!.eyebrow} metrics={module!.metrics} sections={module!.sections} title={module!.title} />;
}
