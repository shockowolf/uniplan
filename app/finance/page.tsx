import { ModulePage } from '@/components/ModulePage';
import { UniplanReferencePage } from '@/components/UniplanReferencePage';
import { findUniplanModuleItem, getUniplanModule } from '@/lib/uniplanModules';

type FinancePageProps = {
  searchParams?: Promise<{ view?: string }>;
};

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const searchParameters = searchParams ? await searchParams : {};
  const selectedModuleItem = findUniplanModuleItem(
    '/finance',
    searchParameters.view,
  );
  const moduleDefinition = getUniplanModule('/finance');

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
