import { ModulePage } from '@/components/ModulePage';
import { UniplanReferencePage } from '@/components/UniplanReferencePage';
import { findUniplanModuleItem, getUniplanModule } from '@/lib/uniplanModules';

type AnalyticsPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

export default async function AnalyticsPage({
  searchParams,
}: AnalyticsPageProps) {
  const searchParameters = searchParams ? await searchParams : {};
  const selectedModuleItem = findUniplanModuleItem(
    '/analytics',
    searchParameters.view,
  );
  const moduleDefinition = getUniplanModule('/analytics');

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
