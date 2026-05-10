import { ErpDataGrid, ErpGridColumn } from './ErpDataGrid';

type Grid = {
  columns: string[];
  rows: Record<string, string | number>[];
};

export function DataGrid({ grid }: { grid?: Grid }) {
  if (!grid?.rows?.length) return null;

  const columns: ErpGridColumn<Record<string, string | number>>[] = grid.columns.map((column) => ({
    accessorKey: column,
    header: column,
    dataType: grid.rows.some((row) => typeof row[column] === 'number') ? 'number' : 'string',
    align: grid.rows.some((row) => typeof row[column] === 'number') ? 'right' : 'left'
  }));

  return (
    <div className="grid-wrap">
      <ErpDataGrid columns={columns} data={grid.rows} title="조회 결과" />
    </div>
  );
}
