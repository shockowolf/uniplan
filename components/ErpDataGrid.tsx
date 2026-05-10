'use client';

import { DragEvent, useEffect, useMemo, useState } from 'react';
import {
  ColumnFiltersState,
  RowSelectionState,
  SortingState,
  VisibilityState,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
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
  const initialColumnVisibility = useMemo(
    () =>
      columns.reduce<VisibilityState>((visibility, column) => {
        visibility[column.accessorKey] = !column.hidden;
        return visibility;
      }, {}),
    [columns]
  );
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(initialColumnVisibility);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showColumnChooser, setShowColumnChooser] = useState(false);
  const [showFilterRow, setShowFilterRow] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<TData | null>(null);
  const columnIds = useMemo(() => columns.map((column) => column.accessorKey), [columns]);
  const columnsById = useMemo(() => new Map(columns.map((column) => [column.accessorKey, column])), [columns]);
  const [columnOrder, setColumnOrder] = useState<string[]>(columnIds);

  useEffect(() => {
    setColumnOrder((currentOrder) => {
      const existingColumnIds = currentOrder.filter((columnId) => columnIds.includes(columnId));
      const newColumnIds = columnIds.filter((columnId) => !existingColumnIds.includes(columnId));
      return [...existingColumnIds, ...newColumnIds];
    });
    setColumnVisibility((currentVisibility) => {
      const nextVisibility = { ...currentVisibility };
      for (const column of columns) {
        if (nextVisibility[column.accessorKey] === undefined) {
          nextVisibility[column.accessorKey] = !column.hidden;
        }
      }
      return nextVisibility;
    });
  }, [columnIds, columns]);

  const tableColumns = useMemo(() => {
    const columnHelper = createColumnHelper<TData>();

    return columns
      .map((column) =>
        columnHelper.accessor((row) => row[column.accessorKey], {
          cell: (info) => <span className={column.align ? `cell-${column.align}` : undefined}>{formatCell(info.getValue() as string | number | null | undefined, column.dataType)}</span>,
          header: column.header,
          id: column.accessorKey,
          minSize: 72,
          size: column.dataType === 'date' ? 88 : 78
        })
      );
  }, [columns]);

  const table = useReactTable({
    columns: tableColumns,
    data,
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    enableMultiRowSelection: true,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    state: { columnFilters, columnOrder, columnVisibility, globalFilter, rowSelection, sorting }
  });

  const visibleRows = table.getRowModel().rows;
  const filteredRows = table.getFilteredRowModel().rows;
  const selectedCount = table.getSelectedRowModel().rows.length;
  const visibleOrderedColumns = table.getVisibleLeafColumns();
  const filterOptions = useMemo(() => {
    return columns.reduce<Record<string, string[]>>((options, column) => {
      const uniqueValues = Array.from(new Set(data.map((row) => row[column.accessorKey]).filter((value) => value !== null && value !== undefined && value !== '').map(String))).sort((a, b) => a.localeCompare(b, 'ko-KR'));
      options[column.accessorKey] = uniqueValues.slice(0, 40);
      return options;
    }, {});
  }, [columns, data]);

  function exportCsv() {
    const csv = toCsv(columns, filteredRows.map((row) => row.original), visibleOrderedColumns.map((column) => column.id));
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title || 'uniplan-grid'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function resetLayout() {
    setColumnFilters([]);
    setColumnOrder(columnIds);
    setColumnVisibility(initialColumnVisibility);
    setGlobalFilter('');
    setRowSelection({});
    setShowFilterRow(false);
    setSorting([]);
    table.setPageSize(20);
    table.setPageIndex(0);
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
          <span>
            총 {filteredRows.length.toLocaleString('ko-KR')}건
            {selectedCount > 0 ? ` · 선택 ${selectedCount.toLocaleString('ko-KR')}건` : ''}
          </span>
        </div>
        <div className="erp-grid-actions">
          <input aria-label="그리드 검색" onChange={(event) => setGlobalFilter(event.target.value)} placeholder="검색" value={globalFilter} />
          <button aria-pressed={showFilterRow} onClick={() => setShowFilterRow((isOpen) => !isOpen)} type="button">필터</button>
          <button onClick={() => setShowColumnChooser((isOpen) => !isOpen)} type="button">컬럼</button>
          <button onClick={exportCsv} type="button">CSV</button>
          <button onClick={resetLayout} type="button">초기화</button>
        </div>
      </div>

      {showColumnChooser ? (
        <div className="erp-column-chooser">
          {table.getAllLeafColumns().map((column) => (
            <label key={column.id}>
              <input checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} type="checkbox" />
              {columnsById.get(column.id)?.header ?? column.id}
            </label>
          ))}
        </div>
      ) : null}

      <div className="erp-grid-scroll">
        <table>
          <colgroup>
            <col className="erp-grid-select-col" />
            {visibleOrderedColumns.map((column) => (
              <col key={column.id} style={{ width: column.getSize() }} />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                <th className="erp-grid-row-select">
                  <input
                    aria-label="현재 페이지 전체 선택"
                    checked={table.getIsAllPageRowsSelected()}
                    onChange={table.getToggleAllPageRowsSelectedHandler()}
                    type="checkbox"
                  />
                </th>
                {headerGroup.headers.map((header) => (
                  <th
                    className={draggedColumnId === header.column.id ? 'erp-grid-dragging' : undefined}
                    draggable
                    key={header.id}
                    onDragEnd={() => setDraggedColumnId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={(event) => handleHeaderDragStart(event, header.column.id)}
                    onDrop={(event) => handleHeaderDrop(event, header.column.id)}
                    style={{ width: header.getSize() }}
                  >
                    <button className="erp-grid-sort" onClick={header.column.getToggleSortingHandler()} type="button">
                      <span aria-hidden="true" className="erp-grid-drag-handle">⋮⋮</span>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span>{header.column.getIsSorted() === 'asc' ? ' ▲' : header.column.getIsSorted() === 'desc' ? ' ▼' : ''}</span>
                    </button>
                    <div className="erp-grid-resizer" onDoubleClick={() => header.column.resetSize()} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} />
                  </th>
                ))}
              </tr>
            ))}
            {showFilterRow ? (
              <tr className="erp-grid-filter-row">
                <th />
                {visibleOrderedColumns.map((column) => {
                  const filterValue = (column.getFilterValue() ?? '') as string;

                  return (
                    <th key={column.id}>
                      <input
                        aria-label={`${columnsById.get(column.id)?.header ?? column.id} 필터`}
                        onChange={(event) => column.setFilterValue(event.target.value)}
                        placeholder="필터"
                        value={filterValue}
                      />
                      <select aria-label={`${columnsById.get(column.id)?.header ?? column.id} 헤더 필터`} onChange={(event) => column.setFilterValue(event.target.value)} value={filterValue}>
                        <option value="">전체</option>
                        {filterOptions[column.id]?.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </th>
                  );
                })}
              </tr>
            ) : null}
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr className={row.getIsSelected() ? 'erp-grid-selected-row' : undefined} key={row.id} onDoubleClick={() => setSelectedRow(row.original)}>
                <td className="erp-grid-row-select" onDoubleClick={(event) => event.stopPropagation()}>
                  <input aria-label="행 선택" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} type="checkbox" />
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              {visibleOrderedColumns.map((column, index) => {
                const sourceColumn = columnsById.get(column.id);
                const sum = sourceColumn?.dataType === 'number'
                  ? filteredRows.reduce((total, row) => {
                      const value = row.original[sourceColumn.accessorKey];
                      return typeof value === 'number' ? total + value : total;
                    }, 0)
                  : null;

                return (
                  <td key={column.id}>
                    {sum !== null ? sum.toLocaleString('ko-KR') : index === 0 ? `합계 / ${filteredRows.length.toLocaleString('ko-KR')}건` : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="erp-grid-pager">
        <button disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} type="button">이전</button>
        <span>
          {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
        </span>
        <button disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} type="button">다음</button>
        <select aria-label="페이지 크기" onChange={(event) => table.setPageSize(Number(event.target.value))} value={table.getState().pagination.pageSize}>
          {[20, 40, 60, 80, 100].map((pageSize) => (
            <option key={pageSize} value={pageSize}>{pageSize}개</option>
          ))}
        </select>
      </div>

      <ErpDialog onClose={() => setSelectedRow(null)} open={Boolean(selectedRow)} title="행 상세">
        <dl className="erp-detail-list">
          {selectedRow
            ? visibleOrderedColumns
                .map((column) => columnsById.get(column.id))
                .filter((column): column is ErpGridColumn<TData> => Boolean(column))
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
