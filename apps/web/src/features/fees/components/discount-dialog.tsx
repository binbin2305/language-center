import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ApplyDiscountInput } from '@lc/shared';
import { MoneyInput } from '@/components/common/money-input';
import { OptionSelect } from '@/components/common/option-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { viParams } from '@/lib/forms';
import { useApplyDiscount } from '../hooks';

// Shared schema + the value rules the server enforces (isValidDiscount), shown inline.
const Schema = ApplyDiscountInput.superRefine((v, ctx) => {
  if (!v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Nhập lý do giảm giá' });
  if (v.value <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Giá trị giảm phải lớn hơn 0' });
  else if (v.kind === 'PERCENT' && v.value > 100) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Phần trăm giảm tối đa 100' });
  }
});
const MESSAGES = {
  value: 'Nhập giá trị giảm',
  reason: 'Lý do tối đa 500 ký tự',
  kind: 'Chọn loại giảm',
};
const EMPTY = { kind: 'PERCENT' as const, value: Number.NaN, reason: '' };

export function DiscountDialog({
  invoiceId, open, onOpenChange,
}: { invoiceId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { control, register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ApplyDiscountInput>({
    resolver: zodResolver(Schema, viParams(MESSAGES)),
    defaultValues: EMPTY,
  });
  const apply = useApplyDiscount(invoiceId);
  const kind = watch('kind');
  useEffect(() => {
    if (!open) reset(EMPTY);
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) =>
            void handleSubmit((v) =>
              apply.mutate(v, {
                onSuccess: () => { toast.success('Đã gửi đề xuất giảm giá'); onOpenChange(false); },
                onError: (err) => toast.error(errorMessage(err)),
              }),
            )(e)
          }
        >
          <DialogHeader>
            <DialogTitle>Đề xuất giảm giá</DialogTitle>
            <DialogDescription>Quản lý sẽ duyệt đề xuất trước khi áp dụng.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dc-kind">Loại giảm</Label>
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <OptionSelect
                  id="dc-kind"
                  value={field.value}
                  onValueChange={(k) => { field.onChange(k); setValue('value', Number.NaN); }}
                  options={[{ value: 'PERCENT', label: 'Phần trăm' }, { value: 'AMOUNT', label: 'Số tiền' }]}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc-value">Giá trị</Label>
            <Controller
              control={control}
              name="value"
              render={({ field }) =>
                kind === 'AMOUNT' ? (
                  <MoneyInput id="dc-value" value={Number.isFinite(field.value) ? field.value : null}
                    onChange={(v) => field.onChange(v ?? Number.NaN)} />
                ) : (
                  <Input id="dc-value" type="number" value={Number.isFinite(field.value) ? field.value : ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))} />
                )
              }
            />
            {errors.value ? <p className="text-sm text-destructive" role="alert">{errors.value.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc-reason">Lý do</Label>
            <Textarea id="dc-reason" rows={2} {...register('reason')} />
            {errors.reason ? <p className="text-sm text-destructive">{errors.reason.message}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={apply.isPending}>Gửi đề xuất</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
