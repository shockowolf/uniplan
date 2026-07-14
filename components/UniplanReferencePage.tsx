import { ErpDataGrid, ErpGridColumn } from '@/components/ErpDataGrid';
import type { UniplanModuleItem } from '@/lib/uniplanModules';

type ModuleEntityStatusRecord = {
  area: string;
  entity: string;
  status: string;
};

const moduleEntityColumns: ErpGridColumn<ModuleEntityStatusRecord>[] = [
  { accessorKey: 'area', header: '관리영역', align: 'center' },
  { accessorKey: 'entity', header: 'UNIPLAN 엔티티', align: 'left' },
  { accessorKey: 'status', header: '상태', align: 'center' },
];

const statusLabel: Record<UniplanModuleItem['status'], string> = {
  ready: '연결됨',
  planned: '설계됨',
  reference: '참조',
};

export function UniplanReferencePage({
  moduleItem,
}: {
  moduleItem: UniplanModuleItem;
}) {
  const moduleEntityRecords = moduleItem.entities.map((entityName) => ({
    area: moduleItem.label,
    entity: entityName,
    status: statusLabel[moduleItem.status],
  }));
  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">UNIPLAN / {moduleItem.code}</p>
          <h1>{moduleItem.label}</h1>
        </div>
        <div className="status-pill">{statusLabel[moduleItem.status]}</div>
      </header>
      <section className="metrics">
        <article className="metric-card">
          <span>리소스</span>
          <strong>{moduleItem.resourceCode}</strong>
        </article>
        <article className="metric-card">
          <span>엔티티</span>
          <strong>{moduleItem.entities.length}</strong>
        </article>
      </section>
      <section className="module-panel user-management-panel">
        <p className="answer-text">{moduleItem.purpose}</p>
        <ErpDataGrid
          columns={moduleEntityColumns}
          data={moduleEntityRecords}
          title={`${moduleItem.label} 구조`}
        />
      </section>
    </section>
  );
}
