'use client';

import { DragEvent, useEffect, useMemo, useState } from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, SortingState, useReactTable } from '@tanstack/react-table';
import { ErpDialog } from './ErpDialog';

export type ErpGridColumn<TData extends Record<string, string | number | null | undefined>> = {
  align?: 'left' | 'center' | 'right';
  accessorKey: keyof TData & string;
  dataType?: 'date' | 'number' | 'string';
  header: string;
  hidden?: boolean;
};

type ErpDataGridProps<TData extends Record<string, string | number | null | undefined>> = {
  columns: ErpGridColumn<TData>[];
  data: TData[];
  title?: string;
};

function formatCell(value: string | number | null | undefined, dataType?: ErpGridColumn<Record<string, string | number | null | undefined>>['dataType']) {
  if (value === null || value === undefined || value === '') return '-';
  if (dataType === 'number' && typeof value === 'number') return value.toLocaleString('ko-KR');
  return String(value);
}

function toCsv<TData extends Record<string, string | number | null | undefined>>(columns: ErpGridColumn<TData>[], rows: TData[], columnOrder: string[]) {
  const visibleColumns = columnOrder
    .map((columnId) => columns.find((column) => column.accessorKey === columnId))
    .filter((column): column is ErpGridColumn<TData> => Boolean(column && !column.hidden));
  const escape = (value: string | number | null | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [visibleColumns.map((column) => escape(column.header)).join(','), ...rows.map((row) => visibleColumns.map((column) => escape(row[column.accessorKey])).join(','))].join('\n');
}

export function ErpDataGrid<TData extends Record<string, string | number | null | undefined>>({ columns, data, title }: ErpDataGridProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<TData | null>(null);
  const visibleColumnIds = useMemo(() => columns.filter((column) => !column.hidden).map((column) => column.accessorKey), [columns]);
  const [columnOrder, setColumnOrder] = useState<string[]>(visibleColumnIds);

  useEffect(() => {
    setColumnOrder((currentOrder) => {
      const existingVisibleIds = currentOrder.filter((columnId) => visibleColumnIds.includes(columnId));
      const newVisibleIds = visibleColumnIds.filter((columnId) => !existingVisibleIds.includes(columnId));
      return [...existingVisibleIds, ...newVisibleIds];
    });
  }, [visibleColumnIds]);

  const tableColumns = useMemo(() => {
    const columnHelper = createColumnHelper<TData>();

    return columns
      .filter((column) => !column.hidden)
      .map((column) =>
        columnHelper.accessor((row) => row[column.accessorKey], {
          cell: (info) => <span className={column.align ? `cell-${column.align}` : undefined}>{formatCell(info.getValue() as string | number | null | undefined, column.dataType)}</span>,
          header: column.header,
          id: column.accessorKey
        })
      );
  }, [columns]);

  const table = useReactTable({
    columns: tableColumns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: setColumnOrder,
    onSortingChange: setSorting,
    state: { columnOrder, globalFilter, sorting }
  });

  const visibleRows = table.getRowModel().rows;

  function exportCsv() {
    const csv = toCsv(columns, visibleRows.map((row) => row.original), columnOrder);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title || 'uniplan-grid'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function moveColumn(fromColumnId: string, toColumnId: string) {
    if (fromColumnId === toColumnId) return;

    setColumnOrder((currentOrder) => {
      const nextOrder = [...currentOrder];
      const fromIndex = nextOrder.indexOf(fromColumnId);
      const toIndex = nextOrder.indexOf(toColumnId);

      if (fromIndex < 0 || toIndex < 0) return currentOrder;

      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, fromColumnId);
      return nextOrder;
    });
  }

  function handleHeaderDragStart(event: DragEvent<HTMLTableCellElement>, columnId: string) {
    setDraggedColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
  }

  function handleHeaderDrop(event: DragEvent<HTMLTableCellElement>, columnId: string) {
    event.preventDefault();
    const sourceColumnId = event.dataTransfer.getData('text/plain') || draggedColumnId;
    if (sourceColumnId) moveColumn(sourceColumnId, columnId);
    setDraggedColumnId(null);
  }

  return (
    <section className="erp-grid">
      <div className="erp-grid-toolbar">
        <div>
          {title ? <h2>{title}</h2> : null}
          <span>{visibleRows.length.toLocaleString('ko-KR')}건</span>
        </div>
        <div className="erp-grid-actions">
          <input aria-label="그리드 검색" onChange={(event) => setGlobalFilter(event.target.value)} placeholder="검색" value={globalFilter} />
          <button onClick={exportCsv} type="button">CSV</button>
        </div>
      </div>

      <div className="erp-grid-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    className={draggedColumnId === header.column.id ? 'erp-grid-dragging' : undefined}
                    draggable
                    key={header.id}
                    onDragEnd={() => setDraggedColumnId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={(event) => handleHeaderDragStart(event, header.column.id)}
                    onDrop={(event) => handleHeaderDrop(event, header.column.id)}
                  >
                    <button className="erp-grid-sort" onClick={header.column.getToggleSortingHandler()} type="button">
                      <span aria-hidden="true" className="erp-grid-drag-handle">⋮⋮</span>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span>{header.column.getIsSorted() === 'asc' ? ' ▲' : header.column.getIsSorted() === 'desc' ? ' ▼' : ''}</span>
                    </button>
                  </th>
                ))}
                <th className="erp-grid-row-action">상세</th>
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
                <td className="erp-grid-row-action">
                  <button onClick={() => setSelectedRow(row.original)} type="button">보기</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ErpDialog onClose={() => setSelectedRow(null)} open={Boolean(selectedRow)} title="행 상세">
        <dl className="erp-detail-list">
          {selectedRow
            ? columns
                .filter((column) => !column.hidden)
                .map((column) => (
                  <div key={column.accessorKey}>
                    <dt>{column.header}</dt>
                    <dd>{formatCell(selectedRow[column.accessorKey], column.dataType)}</dd>
                  </div>
                ))
            : null}
        </dl>
      </ErpDialog>
    </section>
  );
}
