import { ModulePage } from '@/components/ModulePage';
import { UniplanReferencePage } from '@/components/UniplanReferencePage';
import { findUniplanModuleItem, getUniplanModule } from '@/lib/uniplanModules';

type SalesPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const searchParameters = searchParams ? await searchParams : {};
  const selectedModuleItem = findUniplanModuleItem(
    '/sales',
    searchParameters.view,
  );
  const moduleDefinition = getUniplanModule('/sales');

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
