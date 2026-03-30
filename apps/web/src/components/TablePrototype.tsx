import { useMemo, useRef } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { tableRows } from '../data';
import type { DemoRow } from '../types';
import { PrototypeChrome } from './PrototypeChrome';

const columnHelper = createColumnHelper<DemoRow>();

const columns = [
  columnHelper.accessor('entityId', {
    header: 'Entity',
    cell: (info) => <span className="mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor('title', {
    header: 'Title',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('owner', {
    header: 'Owner',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => <StatusPill status={info.getValue()} />,
  }),
  columnHelper.accessor('updatedAt', {
    header: 'Updated',
    cell: (info) => info.getValue(),
  }),
];

function StatusPill({ status }: { status: DemoRow['status'] }) {
  return <span className={`status-pill status-pill--${status}`}>{status}</span>;
}

export function TablePrototype() {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const table = useReactTable({
    data: tableRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const rangeLabel = useMemo(() => {
    if (virtualRows.length === 0) {
      return '0 visible rows';
    }

    return `${virtualRows[0].index + 1} to ${virtualRows[virtualRows.length - 1].index + 1} visible rows`;
  }, [virtualRows]);

  return (
    <PrototypeChrome
      title="Table prototype"
      summary="TanStack Table plus TanStack Virtual. The point is to confirm that large row sets stay usable and fast."
      aside={
        <div className="stack">
          <div className="info-card">
            <h3>What this checks</h3>
            <ul className="bullet-list">
              <li>Virtualized rendering for long lists.</li>
              <li>Stable column definitions and row model flow.</li>
              <li>A future path for saved views and entity tables.</li>
            </ul>
          </div>
          <div className="info-card">
            <h3>Virtualization summary</h3>
            <dl className="metric-grid">
              <div>
                <dt>Total rows</dt>
                <dd>{rows.length}</dd>
              </div>
              <div>
                <dt>Rendered</dt>
                <dd>{virtualRows.length}</dd>
              </div>
              <div>
                <dt>Window</dt>
                <dd>{rangeLabel}</dd>
              </div>
            </dl>
          </div>
        </div>
      }
    >
      <div className="table-shell">
        <div className="table-scroll" ref={parentRef}>
          <table className="demo-table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
              }}
            >
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index];

                return (
                  <tr
                    key={row.id}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PrototypeChrome>
  );
}
