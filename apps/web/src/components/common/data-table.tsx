import type { ReactNode } from 'react';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
}

const SKELETON_ROWS = 5;

export function DataTable<T>({
  columns, data, total, page, limit, onPageChange, isLoading, isError, onRetry, empty, getRowId,
}: DataTableProps<T>) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const table = useReactTable({
    columns,
    data,
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
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={cellClass(h.column.columnDef.meta?.hideOnMobile, h.column.columnDef.meta?.className)}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
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
                  <TableRow key={row.id}>
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
      {!isLoading && total > 0 ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">{`Trang ${page}/${pageCount}`}</span>
          <Button variant="outline" size="icon" aria-label="Trang trước" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Trang sau" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
