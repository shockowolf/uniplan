import { ModulePage } from '@/components/ModulePage';
import { UniplanReferencePage } from '@/components/UniplanReferencePage';
import { findUniplanModuleItem, getUniplanModule } from '@/lib/uniplanModules';

type CollaborationPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

export default async function CollaborationPage({
  searchParams,
}: CollaborationPageProps) {
  const searchParameters = searchParams ? await searchParams : {};
  const selectedModuleItem = findUniplanModuleItem(
    '/collaboration',
    searchParameters.view,
  );
  const moduleDefinition = getUniplanModule('/collaboration');

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
