import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label?: string;
  submitLabel?: string;
  minLength?: number;
  isPending?: boolean;
  onSubmit: (reason: string) => void;
}

export function ReasonDialog({
  open, onOpenChange, title, description, label = 'Lý do', submitLabel = 'Gửi', minLength = 5, isPending, onSubmit,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const id = useId();
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < minLength;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tooShort) onSubmit(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description ?? `Nhập lý do (tối thiểu ${minLength} ký tự).`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            {reason.length > 0 && tooShort ? (
              <p className="text-sm text-destructive">{`Lý do cần ít nhất ${minLength} ký tự.`}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={tooShort || isPending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
