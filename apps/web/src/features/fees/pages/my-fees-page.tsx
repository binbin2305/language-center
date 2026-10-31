import { PageHeader } from '@/components/common/page-header';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { MoneyText } from '@/components/common/money-text';
import { StatusBadge } from '@/components/common/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useInvoices } from '../hooks';
import type { InvoiceDto } from '@lc/shared';

export default function MyFeesPage() {
  const list = useInvoices({ page: 1, limit: 50 });
  const rows = (list.data?.data ?? []).filter((r): r is InvoiceDto => 'finalAmount' in r);
  return (
    <div>
      <PageHeader title="Học phí của tôi" />
      {list.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {list.isError ? <ErrorState onRetry={() => void list.refetch()} /> : null}
      {list.isSuccess && rows.length === 0 ? <EmptyState title="Chưa có hóa đơn" /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((inv) => (
          <article key={inv.id} className="space-y-2 rounded-lg border p-4" aria-label={`Hóa đơn ${inv.code}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{inv.code}</p>
                {inv.description ? <p className="text-sm text-muted-foreground">{inv.description}</p> : null}
              </div>
              <StatusBadge group="invoice" value={inv.status} overdue={inv.overdue} />
            </div>
            <p className="text-sm text-muted-foreground">Còn nợ</p>
            <MoneyText value={inv.balance} className="text-2xl font-semibold" />
            <p className="text-sm text-muted-foreground">{`Hạn đóng: ${formatDate(inv.dueDate)}`}</p>
            <p className="text-sm text-muted-foreground">
              Đã đóng <MoneyText value={inv.amountPaid} /> / <MoneyText value={inv.finalAmount} />
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
