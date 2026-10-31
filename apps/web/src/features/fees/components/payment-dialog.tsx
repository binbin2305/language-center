import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ALL_PAYMENT_METHODS, type PaymentMethod } from '@lc/shared';
import { DatePicker } from '@/components/common/date-picker';
import { MoneyInput } from '@/components/common/money-input';
import { OptionSelect } from '@/components/common/option-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { useRecordPayment } from '../hooks';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
};

export function PaymentDialog({
  invoiceId, balance, open, onOpenChange,
}: { invoiceId: string; balance: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [amount, setAmount] = useState<number | null>(balance);
  const [method, setMethod] = useState<string>('CASH');
  const [paidDay, setPaidDay] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const pay = useRecordPayment(invoiceId);
  useEffect(() => {
    if (open) {
      setAmount(balance);
      setError('');
      setNote('');
      setPaidDay(null);
    }
  }, [open, balance]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return setError('Nhập số tiền lớn hơn 0');
    if (amount > balance) return setError('Số tiền vượt quá số còn nợ');
    pay.mutate(
      {
        amount,
        method: method as PaymentMethod,
        // VN noon of the chosen day; omitted = server clock.
        ...(paidDay ? { paidAt: `${paidDay}T05:00:00.000Z` } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Đã ghi nhận thanh toán');
          onOpenChange(false);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Ghi nhận thanh toán</DialogTitle>
            <DialogDescription>Số tiền mặc định là số còn nợ của hóa đơn.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Số tiền</Label>
            <MoneyInput
              id="pay-amount"
              value={amount}
              onChange={(v) => { setAmount(v); setError(''); }}
              aria-invalid={error ? true : undefined}
            />
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Hình thức</Label>
            <OptionSelect
              id="pay-method"
              value={method}
              onValueChange={setMethod}
              options={ALL_PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Ngày thu</Label>
            <DatePicker id="pay-date" value={paidDay} onChange={setPaidDay} placeholder="Hôm nay" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Ghi chú</Label>
            <Textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={pay.isPending}>Ghi nhận</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
