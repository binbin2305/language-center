import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { EnrollmentStatus, WithdrawEnrollmentInput } from '@lc/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { useWithdraw } from '../hooks';

export interface WithdrawDialogProps {
  enrollmentId: string;
  /** CANCELLED = rút khỏi khóa, RESERVED = bảo lưu. */
  status: 'CANCELLED' | 'RESERVED';
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COPY = {
  CANCELLED: { title: 'Rút học viên khỏi khóa học', submit: 'Xác nhận rút', done: 'Đã rút khỏi khóa học' },
  RESERVED: { title: 'Bảo lưu khóa học', submit: 'Xác nhận bảo lưu', done: 'Đã bảo lưu' },
} as const;

export function WithdrawDialog({ enrollmentId, status, open, onOpenChange }: WithdrawDialogProps) {
  const withdraw = useWithdraw(enrollmentId);
  const copy = COPY[status];
  const form = useForm<WithdrawEnrollmentInput>({
    resolver: zodResolver(WithdrawEnrollmentInput),
    mode: 'onChange',
    defaultValues: { status: EnrollmentStatus[status], reason: '' },
  });
  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await withdraw.mutateAsync(v);
      toast.success(copy.done);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>Nhập lý do (tối thiểu 5 ký tự).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`withdraw-reason-${status}`}>Lý do</Label>
            <Textarea id={`withdraw-reason-${status}`} rows={3} {...form.register('reason')} />
            {form.formState.errors.reason ? (
              <p className="text-sm text-destructive">Lý do cần ít nhất 5 ký tự.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant={status === 'CANCELLED' ? 'destructive' : 'default'}
              disabled={!form.formState.isValid || !form.watch('reason') || withdraw.isPending}
            >
              {copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
