import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { TransferEnrollmentInput, type EnrollmentDto } from '@lc/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useOpenClasses, useTransfer } from '../hooks';
import { ClassChoiceList } from './class-choice-list';

export interface TransferDialogProps {
  enrollment: EnrollmentDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferDialog({ enrollment, open, onOpenChange }: TransferDialogProps) {
  const classes = useOpenClasses(enrollment.courseId, open);
  const transfer = useTransfer(enrollment.id);
  // Ruling R15: transfer needs no level override, so a single flat group.
  const items = (classes.data?.data ?? []).filter((c) => c.id !== enrollment.classId);
  const form = useForm<TransferEnrollmentInput>({
    resolver: zodResolver(TransferEnrollmentInput),
    mode: 'onChange',
    defaultValues: { toClassId: '', reason: '' },
  });
  const toClassId = form.watch('toClassId');
  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const submit = form.handleSubmit(async (v) => {
    try {
      await transfer.mutateAsync(v);
      toast.success('Đã chuyển lớp');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CLASS_FULL') {
        toast.error('Lớp vừa đầy. Danh sách lớp đã được làm mới, chọn lớp khác.');
        form.setValue('toClassId', '');
        void classes.refetch();
      } else {
        toast.error(errorMessage(e));
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Chuyển lớp</DialogTitle>
            <DialogDescription>Chọn lớp đích cùng khóa học còn chỗ và nhập lý do.</DialogDescription>
          </DialogHeader>
          {classes.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có lớp khác còn chỗ trong khóa học này.</p>
          ) : (
            <ClassChoiceList
              name="transfer-class"
              value={toClassId}
              onChange={(id) => form.setValue('toClassId', id, { shouldValidate: true })}
              groups={[{ label: 'Lớp đích', classes: items }]}
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Lý do</Label>
            <Textarea id="transfer-reason" rows={2} {...form.register('reason')} />
            {form.formState.errors.reason ? (
              <p className="text-sm text-destructive">Lý do cần ít nhất 5 ký tự.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={!form.formState.isValid || !form.watch('reason') || transfer.isPending}>
              Chuyển lớp
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
