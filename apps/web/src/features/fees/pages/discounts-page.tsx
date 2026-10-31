import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { InvoiceDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { MoneyText } from '@/components/common/money-text';
import { PageHeader } from '@/components/common/page-header';
import { usePendingDiscounts } from '../hooks';
import { DiscountDecisionButtons } from '../components/discount-decision-buttons';

const columns: ColumnDef<InvoiceDto>[] = [
  {
    id: 'code',
    header: 'Mã HĐ',
    cell: ({ row }) => <Link className="font-medium hover:underline" to={`/fees/invoices/${row.original.id}`}>{row.original.code}</Link>,
  },
  { id: 'student', header: 'Học viên', cell: ({ row }) => row.original.studentName ?? '' },
  { id: 'amountDue', header: 'Học phí', cell: ({ row }) => <MoneyText value={row.original.amountDue} /> },
  {
    id: 'discount',
    header: 'Giảm giá',
    cell: ({ row }) => {
      const d = row.original.discount;
      if (!d) return null;
      return (
        <span>
          {d.kind === 'PERCENT' ? `${d.value}% = ` : ''}
          <MoneyText value={d.amount} />
        </span>
      );
    },
  },
  { id: 'reason', header: 'Lý do', cell: ({ row }) => row.original.discount?.reason ?? '' },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <DiscountDecisionButtons invoiceId={row.original.id} />,
  },
];

export default function DiscountsPage() {
  const [page, setPage] = useState(1);
  const list = usePendingDiscounts(page);
  return (
    <div>
      <PageHeader title="Duyệt giảm giá" />
      <DataTable
        columns={columns}
        data={list.data?.data ?? []}
        total={list.data?.meta.total ?? 0}
        page={page}
        limit={20}
        onPageChange={setPage}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(r) => r.id}
        empty={{ title: 'Không có yêu cầu chờ duyệt' }}
      />
    </div>
  );
}
