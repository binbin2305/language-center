import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ALL_PAYMENT_METHODS, RecordPaymentInput, type PaymentMethod } from '@lc/shared';
import { DatePicker } from '@/components/common/date-picker';
import { MoneyInput } from '@/components/common/money-input';
import { OptionSelect } from '@/components/common/option-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { viParams } from '@/lib/forms';
import { useRecordPayment } from '../hooks';

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
};

const MESSAGES = {
  amount: 'Nhập số tiền lớn hơn 0',
  method: 'Chọn hình thức thanh toán',
  note: 'Ghi chú tối đa 500 ký tự',
};

export function PaymentDialog({
  invoiceId, balance, open, onOpenChange,
}: { invoiceId: string; balance: number; open: boolean; onOpenChange: (o: boolean) => void }) {
  // Shared schema + the over-balance rule that depends on this invoice.
  const schema = useMemo(
    () =>
      RecordPaymentInput.superRefine((v, ctx) => {
        if (v.amount > balance) {
          ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Số tiền vượt quá số còn nợ' });
        }
      }),
    [balance],
  );
  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<RecordPaymentInput>({
    resolver: zodResolver(schema, viParams(MESSAGES)),
    defaultValues: { amount: balance, method: 'CASH', note: '' },
  });
  const [paidDay, setPaidDay] = useState<string | null>(null);
  const pay = useRecordPayment(invoiceId);
  useEffect(() => {
    if (open) {
      reset({ amount: balance, method: 'CASH', note: '' });
      setPaidDay(null);
    }
  }, [open, balance, reset]);

  const submit = handleSubmit((v) => {
    pay.mutate(
      {
        amount: v.amount,
        method: v.method,
        // VN noon of the chosen day; omitted = server clock.
        ...(paidDay ? { paidAt: `${paidDay}T05:00:00.000Z` } : {}),
        ...(v.note?.trim() ? { note: v.note.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success('Đã ghi nhận thanh toán');
          onOpenChange(false);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form className="space-y-4" onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>Ghi nhận thanh toán</DialogTitle>
            <DialogDescription>Số tiền mặc định là số còn nợ của hóa đơn.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Số tiền</Label>
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <MoneyInput
                  id="pay-amount"
                  value={Number.isFinite(field.value) ? field.value : null}
                  onChange={(v) => field.onChange(v ?? Number.NaN)}
                  aria-invalid={errors.amount ? true : undefined}
                />
              )}
            />
            {errors.amount ? <p className="text-sm text-destructive" role="alert">{errors.amount.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Hình thức</Label>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <OptionSelect
                  id="pay-method"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={ALL_PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">Ngày thu</Label>
            <DatePicker id="pay-date" value={paidDay} onChange={setPaidDay} placeholder="Hôm nay" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Ghi chú</Label>
            <Textarea id="pay-note" rows={2} {...register('note')} />
            {errors.note ? <p className="text-sm text-destructive">{errors.note.message}</p> : null}
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
