import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { InvoiceDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { MoneyText } from '@/components/common/money-text';
import { StatusBadge } from '@/components/common/status-badge';
import { formatDate } from '@/lib/format';
import type { InvoiceListParams, InvoiceRow } from '../api';
import { useInvoices } from '../hooks';

const LIMIT = 20;
const isFull = (r: InvoiceRow): r is InvoiceDto => 'finalAmount' in r;

const status: ColumnDef<InvoiceRow> = {
  id: 'status',
  header: 'Trạng thái',
  cell: ({ row }) => <StatusBadge group="invoice" value={row.original.status} overdue={row.original.overdue} />,
};
const student: ColumnDef<InvoiceRow>[] = [
  { id: 'studentCode', header: 'Mã HV', cell: ({ row }) => row.original.studentCode ?? '' },
  { id: 'studentName', header: 'Học viên', cell: ({ row }) => row.original.studentName ?? '' },
];
const balance: ColumnDef<InvoiceRow> = {
  id: 'balance',
  header: 'Còn nợ',
  cell: ({ row }) => <MoneyText value={row.original.balance} className="font-medium" />,
  meta: { className: 'text-right' },
};

const fullColumns: ColumnDef<InvoiceRow>[] = [
  {
    id: 'code',
    header: 'Mã HĐ',
    cell: ({ row }) => (
      <Link to={`/fees/invoices/${row.original.id}`} className="font-medium hover:underline">
        {row.original.code}
      </Link>
    ),
  },
  ...student,
  {
    id: 'finalAmount',
    header: 'Phải đóng',
    cell: ({ row }) => (isFull(row.original) ? <MoneyText value={row.original.finalAmount} /> : null),
    meta: { hideOnMobile: true, className: 'text-right' },
  },
  {
    id: 'amountPaid',
    header: 'Đã đóng',
    cell: ({ row }) => (isFull(row.original) ? <MoneyText value={row.original.amountPaid} /> : null),
    meta: { hideOnMobile: true, className: 'text-right' },
  },
  balance,
  { id: 'dueDate', header: 'Hạn', cell: ({ row }) => formatDate(row.original.dueDate), meta: { hideOnMobile: true } },
  status,
];
const teacherColumns: ColumnDef<InvoiceRow>[] = [...student, balance, status];

/** Invoice table with sum footer of the current page (D20). Teachers get the reduced columns. */
export function InvoiceTable({ filters, teacher }: { filters: InvoiceListParams; teacher: boolean }) {
  const [page, setPage] = useState(1);
  const list = useInvoices({ ...filters, page, limit: LIMIT });
  const rows = list.data?.data ?? [];
  const sum = (f: (r: InvoiceDto) => number) => rows.filter(isFull).reduce((a, r) => a + f(r), 0);
  return (
    <div className="space-y-3">
      <DataTable
        columns={teacher ? teacherColumns : fullColumns}
        data={rows}
        total={list.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(r) => r.id}
        empty={{ title: 'Chưa có hóa đơn', description: 'Không có hóa đơn phù hợp bộ lọc.' }}
      />
      {!teacher && rows.length > 0 ? (
        <dl data-testid="fees-total" className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-1"><dt className="text-muted-foreground">Phải đóng:</dt><dd><MoneyText value={sum((r) => r.finalAmount)} /></dd></div>
          <div className="flex gap-1"><dt className="text-muted-foreground">Đã đóng:</dt><dd><MoneyText value={sum((r) => r.amountPaid)} /></dd></div>
          <div className="flex gap-1"><dt className="text-muted-foreground">Còn nợ:</dt><dd><MoneyText value={sum((r) => r.balance)} className="font-semibold" /></dd></div>
        </dl>
      ) : null}
    </div>
  );
}
