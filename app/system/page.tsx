import { ModulePage } from '@/components/ModulePage';
import { UniplanReferencePage } from '@/components/UniplanReferencePage';
import { UniChartDashboard } from '@/components/system/UniChartDashboard';
import { UserManagementDetail } from '@/components/system/UserManagementDetail';
import { findUniplanModuleItem, getUniplanModule } from '@/lib/uniplanModules';

type SystemPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

export default async function SystemPage({ searchParams }: SystemPageProps) {
  const searchParameters = searchParams ? await searchParams : {};

  if (searchParameters.view === 'settings-users') {
    return <UserManagementDetail />;
  }

  if (searchParameters.view === 'settings-charts') {
    return <UniChartDashboard />;
  }

  const selectedModuleItem = findUniplanModuleItem(
    '/system',
    searchParameters.view,
  );
  const moduleDefinition = getUniplanModule('/system');

  if (selectedModuleItem)
    return <UniplanReferencePage moduleItem={selectedModuleItem} />;

  return (
    <ModulePage
      description={moduleDefinition!.description}
      eyebrow={moduleDefinition!.eyebrow}
      metrics={moduleDefinition!.metrics}
      sections={moduleDefinition!.sections}
      title={moduleDefinition!.title}
    />
  );
}
