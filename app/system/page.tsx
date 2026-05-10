import { ModulePage } from '@/components/ModulePage';
import { UniErpAdminPage } from '@/components/UniErpAdminPage';
import { UniChartDashboard } from '@/components/system/UniChartDashboard';
import { UserManagementDetail } from '@/components/system/UserManagementDetail';
import { findUniErpMenuItem, getUniErpModule } from '@/lib/uniErpBlueprint';

type SystemPageProps = {
  searchParams?: Promise<{ legacy?: string }>;
};

export default async function SystemPage({ searchParams }: SystemPageProps) {
  const params = searchParams ? await searchParams : {};

  if (params.legacy === 'LM002') {
    return <UserManagementDetail />;
  }

  if (params.legacy === 'LM009') {
    return <UniChartDashboard />;
  }

  const adminPage = findUniErpMenuItem('/system', params.legacy);
  const module = getUniErpModule('/system');

  if (adminPage) return <UniErpAdminPage page={adminPage} />;

  return <ModulePage description={module!.description} eyebrow={module!.eyebrow} metrics={module!.metrics} sections={module!.sections} title={module!.title} />;
}
