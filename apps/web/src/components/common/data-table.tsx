import type { ReactNode } from 'react';
import {
  flexRender, getCoreRowModel, useReactTable,
  type ColumnDef, type OnChangeFn, type RowData, type RowSelectionState, type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Hide this column below 768px. */
    hideOnMobile?: boolean;
    className?: string;
  }
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  total: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  empty: { title: string; description?: string; action?: ReactNode };
  getRowId?: (row: T) => string;
  /** Server sort: `field` (asc) or `-field` (desc); column `id`/accessorKey is the field. */
  sort?: string;
  onSortChange?: (sort: string) => void;
  /** Selected rows keyed by getRowId. The checkbox column shows only with `onRowSelectionChange`. */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: Record<string, boolean>) => void;
}

const SKELETON_ROWS = 5;

const ariaSort = (s: false | 'asc' | 'desc') =>
  s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : 'none';

export function DataTable<T>({
  columns, data, total, page, limit, onPageChange, isLoading, isError, onRetry, empty, getRowId,
  sort, onSortChange, rowSelection, onRowSelectionChange,
}: DataTableProps<T>) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const selectable = Boolean(onRowSelectionChange);
  const sorting: SortingState = sort ? [{ id: sort.replace(/^-/, ''), desc: sort.startsWith('-') }] : [];
  const allColumns: ColumnDef<T>[] = selectable
    ? [
        {
          id: '__select',
          enableSorting: false,
          header: ({ table: t }) => (
            <Checkbox
              aria-label="Chọn tất cả"
              checked={t.getIsAllRowsSelected() ? true : t.getIsSomeRowsSelected() ? 'indeterminate' : false}
              onCheckedChange={(v) => t.toggleAllRowsSelected(v === true)}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Chọn hàng ${row.id}`}
              checked={row.getIsSelected()}
              onCheckedChange={(v) => row.toggleSelected(v === true)}
            />
          ),
        },
        ...columns,
      ]
    : columns;
  const handleSelection: OnChangeFn<RowSelectionState> = (u) => {
    const next = typeof u === 'function' ? u(rowSelection ?? {}) : u;
    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(next)) if (v) clean[k] = true;
    onRowSelectionChange?.(clean);
  };
  const table = useReactTable({
    columns: allColumns,
    data,
    manualSorting: true,
    state: { sorting, rowSelection: rowSelection ?? {} },
    enableRowSelection: selectable,
    onRowSelectionChange: handleSelection,
    onSortingChange: (u) => {
      const next = typeof u === 'function' ? u(sorting) : u;
      const first = next[0];
      onSortChange?.(first ? `${first.desc ? '-' : ''}${first.id}` : '');
    },
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });
  const cellClass = (hide?: boolean, extra?: string) => cn(hide && 'hidden md:table-cell', extra);

  if (isError) {
    return (
      <div className="rounded-md border">
        <ErrorState onRetry={onRetry} />
      </div>
    );
  }

  const showEmpty = !isLoading && data.length === 0;

  return (
    <div className="space-y-3" aria-busy={isLoading || undefined}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    aria-sort={
                      (h.column.columnDef.enableSorting === true && onSortChange)
                        ? ariaSort(h.column.getIsSorted())
                        : undefined
                    }
                    className={cellClass(h.column.columnDef.meta?.hideOnMobile, h.column.columnDef.meta?.className)}
                  >
                    {h.isPlaceholder ? null : (h.column.columnDef.enableSorting === true && onSortChange) ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                        onClick={() => onSortChange(h.column.getIsSorted() === 'asc' ? `-${h.column.id}` : h.column.id)}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : h.column.getIsSorted() === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {table.getVisibleLeafColumns().map((c) => (
                      <TableCell key={c.id} className={cellClass(c.columnDef.meta?.hideOnMobile)}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cellClass(cell.column.columnDef.meta?.hideOnMobile, cell.column.columnDef.meta?.className)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {showEmpty ? <EmptyState {...empty} /> : null}
      </div>
      {total > 0 ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">{`Trang ${page}/${pageCount}`}</span>
          <Button variant="outline" size="icon" aria-label="Trang trước" disabled={isLoading || page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Trang sau" disabled={isLoading || page >= pageCount} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
