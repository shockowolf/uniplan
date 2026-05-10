import { ErpDataGrid, ErpGridColumn } from '@/components/ErpDataGrid';
import type { UniErpMenuItem } from '@/lib/uniErpBlueprint';

type StructureRow = {
  area: string;
  sourceTable: string;
  targetEntity: string;
  status: string;
};

const structureColumns: ErpGridColumn<StructureRow>[] = [
  { accessorKey: 'area', header: '관리영역', align: 'center' },
  { accessorKey: 'sourceTable', header: '참조 DB 구조', align: 'left' },
  { accessorKey: 'targetEntity', header: 'UniPlan 엔티티', align: 'left' },
  { accessorKey: 'status', header: '상태', align: 'center' }
];

const statusLabel: Record<UniErpMenuItem['status'], string> = {
  ready: '화면 연결',
  planned: '필수 설계',
  reference: '참조 후보'
};

export function UniErpAdminPage({ page }: { page: UniErpMenuItem }) {
  const structureRows = page.legacyTables.map((table, index) => ({
    area: page.label,
    sourceTable: table,
    targetEntity: page.targetEntities[index] ?? page.targetEntities[0] ?? '-',
    status: statusLabel[page.status]
  }));

  return (
    <section className="dashboard-main">
      <header className="topbar">
        <div>
          <p className="eyebrow">Uni ERP / {page.legacyMapId}</p>
          <h1>{page.label}</h1>
        </div>
        <div className="status-pill">{statusLabel[page.status]}</div>
      </header>

      <section className="metrics">
        <article className="metric-card">
          <span>원본 메뉴</span>
          <strong>{page.sourceMenu}</strong>
        </article>
        <article className="metric-card">
          <span>참조 테이블</span>
          <strong>{page.legacyTables.length}</strong>
        </article>
        <article className="metric-card">
          <span>Uni 엔티티</span>
          <strong>{page.targetEntities.length}</strong>
        </article>
        <article className="metric-card">
          <span>메뉴 ID</span>
          <strong>{page.legacyMenuId}</strong>
        </article>
      </section>

      <section className="module-panel user-management-panel">
        <div className="uni-filterbar">
          <div>
            <p className="eyebrow">Management Page</p>
            <h2>{page.purpose}</h2>
          </div>
          <div className="uni-filter-fields">
            <label>
              메뉴 ID
              <input defaultValue={page.legacyMenuId} readOnly />
            </label>
            <label>
              상태
              <input defaultValue={statusLabel[page.status]} readOnly />
            </label>
            <label>
              연결 엔티티
              <input defaultValue={page.targetEntities.join(', ')} readOnly />
            </label>
          </div>
        </div>

        <div className="uni-commandbar">
          <button type="button">조회</button>
          <button type="button">신규</button>
          <button type="button">저장</button>
          <button type="button">삭제</button>
        </div>

        <ErpDataGrid columns={structureColumns} data={structureRows} title={`${page.label} DB 매핑`} />
      </section>
    </section>
  );
}
