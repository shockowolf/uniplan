import { ModulePage } from '@/components/ModulePage';
import { UniplanReferencePage } from '@/components/UniplanReferencePage';
import { findUniplanModuleItem, getUniplanModule } from '@/lib/uniplanModules';

type CustomersPageProps = {
  searchParams?: Promise<{ view?: string }>;
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const searchParameters = searchParams ? await searchParams : {};
  const selectedModuleItem = findUniplanModuleItem(
    '/customers',
    searchParameters.view,
  );
  const moduleDefinition = getUniplanModule('/customers');

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
