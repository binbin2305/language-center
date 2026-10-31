import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MoneyInput } from '@/components/common/money-input';
import { OptionSelect } from '@/components/common/option-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { useApplyDiscount } from '../hooks';

export function DiscountDialog({
  invoiceId, open, onOpenChange,
}: { invoiceId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [kind, setKind] = useState<string>('PERCENT');
  const [value, setValue] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const apply = useApplyDiscount(invoiceId);
  useEffect(() => {
    if (!open) { setKind('PERCENT'); setValue(null); setReason(''); }
  }, [open]);
  const valid = value !== null && value > 0 && (kind === 'AMOUNT' || value <= 100) && reason.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid || value === null) return;
            apply.mutate(
              { kind: kind as 'PERCENT' | 'AMOUNT', value, reason: reason.trim() },
              {
                onSuccess: () => { toast.success('Đã gửi đề xuất giảm giá'); onOpenChange(false); },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>Đề xuất giảm giá</DialogTitle>
            <DialogDescription>Quản lý sẽ duyệt đề xuất trước khi áp dụng.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dc-kind">Loại giảm</Label>
            <OptionSelect
              id="dc-kind"
              value={kind}
              onValueChange={(k) => { setKind(k); setValue(null); }}
              options={[{ value: 'PERCENT', label: 'Phần trăm' }, { value: 'AMOUNT', label: 'Số tiền' }]}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc-value">Giá trị</Label>
            {kind === 'AMOUNT' ? (
              <MoneyInput id="dc-value" value={value} onChange={setValue} />
            ) : (
              <Input id="dc-value" type="number" min={1} max={100} value={value ?? ''}
                onChange={(e) => setValue(e.target.value === '' ? null : Number(e.target.value))} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dc-reason">Lý do</Label>
            <Textarea id="dc-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={!valid || apply.isPending}>Gửi đề xuất</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
