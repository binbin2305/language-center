import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { can } from '@lc/shared';
import { ErrorState } from '@/components/common/error-state';
import { MoneyText } from '@/components/common/money-text';
import { PageHeader } from '@/components/common/page-header';
import { ReasonDialog } from '@/components/common/reason-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { formatDate, formatDateTime } from '@/lib/format';
import { DiscountDecisionButtons } from '../components/discount-decision-buttons';
import { DiscountDialog } from '../components/discount-dialog';
import { PaymentDialog } from '../components/payment-dialog';
import { openReceipt } from '../components/receipt';
import { useInvoice, useVoidInvoice, useVoidPayment } from '../hooks';

const METHODS: Record<string, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CARD: 'Thẻ' };

const Row = ({ label, children, big }: { label: string; children: React.ReactNode; big?: boolean }) => (
  <div className="flex items-baseline justify-between gap-4">
    <dt className={big ? 'text-base font-semibold' : 'text-muted-foreground'}>{label}</dt>
    <dd className={big ? 'text-2xl font-bold' : ''}>{children}</dd>
  </div>
);

export default function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = useInvoice(id);
  const voidPayment = useVoidPayment();
  const voidInvoice = useVoidInvoice(id);
  const [paying, setPaying] = useState(false);
  const [discounting, setDiscounting] = useState(false);
  const [voidingPayment, setVoidingPayment] = useState<string | null>(null);
  const [voidingInvoice, setVoidingInvoice] = useState(false);
  const canUpdate = can(user, 'fees.update');
  const canVoid = can(user, 'payments.void');

  const inv = q.data;
  if (!inv) {
    return (
      <div>
        <PageHeader title="Chi tiết hóa đơn" breadcrumb={[{ label: 'Học phí', to: '/fees' }]} />
        {q.isError ? <ErrorState onRetry={() => void q.refetch()} /> : <Skeleton className="h-48 w-full" />}
      </div>
    );
  }
  const active = inv.status !== 'VOID';
  const d = inv.discount;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hóa đơn ${inv.code}`}
        description={[inv.studentCode, inv.studentName].filter(Boolean).join(' - ')}
        breadcrumb={[{ label: 'Học phí', to: '/fees' }, { label: inv.code }]}
        actions={
          <>
            <StatusBadge group="invoice" value={inv.status} overdue={inv.overdue} />
            {canUpdate && active && inv.balance > 0 ? (
              <Button onClick={() => setPaying(true)}>Ghi nhận thanh toán</Button>
            ) : null}
            {canUpdate && active && (!d || d.status === 'REJECTED') ? (
              <Button variant="outline" onClick={() => setDiscounting(true)}>Đề xuất giảm giá</Button>
            ) : null}
            {canVoid && active && inv.amountPaid === 0 ? (
              <Button variant="outline" onClick={() => setVoidingInvoice(true)}>Hủy hóa đơn</Button>
            ) : null}
          </>
        }
      />

      <dl className="max-w-md space-y-2 rounded-lg border p-4">
        <Row label="Học phí"><MoneyText value={inv.amountDue} /></Row>
        <Row label="Giảm giá"><MoneyText value={inv.amountDue - inv.finalAmount} /></Row>
        <Row label="Phải đóng"><MoneyText value={inv.finalAmount} /></Row>
        <Row label="Đã đóng"><MoneyText value={inv.amountPaid} /></Row>
        <Row label="Còn nợ" big><MoneyText value={inv.balance} /></Row>
        <Row label="Hạn đóng">{formatDate(inv.dueDate)}</Row>
      </dl>

      {d ? (
        <section className="space-y-2 rounded-lg border p-4" aria-label="Giảm giá">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Giảm giá</h2>
            <StatusBadge group="discount" value={d.status} />
          </div>
          <p className="text-sm">
            {d.kind === 'PERCENT' ? `${d.value}% = ` : ''}
            <MoneyText value={d.amount} />
            {` - ${d.reason}`}
          </p>
          {d.status === 'PENDING_APPROVAL' ? <DiscountDecisionButtons invoiceId={inv.id} /> : null}
        </section>
      ) : null}

      <section aria-label="Lịch sử thanh toán" className="space-y-2">
        <h2 className="font-semibold">Lịch sử thanh toán</h2>
        {inv.payments.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có thanh toán.</p> : null}
        <ul className="divide-y rounded-lg border">
          {inv.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
              <span className="font-medium">{p.code}</span>
              <span>{formatDateTime(p.paidAt)}</span>
              <MoneyText value={p.amount} className={p.status === 'VOIDED' ? 'line-through' : ''} />
              <span>{METHODS[p.method] ?? p.method}</span>
              {p.status === 'VOIDED' ? <StatusBadge group="payment" value={p.status} /> : null}
              {p.voidReason ? <span className="text-muted-foreground">{`Lý do hủy: ${p.voidReason}`}</span> : null}
              <span className="ml-auto flex gap-2">
                {p.status === 'VALID' ? (
                  <Button size="sm" variant="outline" onClick={() => void openReceipt(p.id)}>In phiếu</Button>
                ) : null}
                {canVoid && p.status === 'VALID' ? (
                  <Button size="sm" variant="outline" onClick={() => setVoidingPayment(p.id)}>Hủy phiếu thu</Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <PaymentDialog invoiceId={inv.id} balance={inv.balance} open={paying} onOpenChange={setPaying} />
      <DiscountDialog invoiceId={inv.id} open={discounting} onOpenChange={setDiscounting} />
      <ReasonDialog
        open={voidingPayment !== null}
        onOpenChange={(o) => !o && setVoidingPayment(null)}
        title="Hủy phiếu thu"
        submitLabel="Hủy phiếu thu"
        isPending={voidPayment.isPending}
        onSubmit={(reason) =>
          voidPayment.mutate(
            { id: voidingPayment ?? '', reason },
            {
              onSuccess: () => { toast.success('Đã hủy phiếu thu'); setVoidingPayment(null); },
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
      <ReasonDialog
        open={voidingInvoice}
        onOpenChange={setVoidingInvoice}
        title="Hủy hóa đơn"
        description="Lý do hủy (không bắt buộc)."
        minLength={0}
        submitLabel="Hủy hóa đơn"
        isPending={voidInvoice.isPending}
        onSubmit={(reason) =>
          voidInvoice.mutate(reason || undefined, {
            onSuccess: () => { toast.success('Đã hủy hóa đơn'); setVoidingInvoice(false); },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  );
}
