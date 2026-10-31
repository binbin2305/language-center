import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AssignClassInput, type WaitingEnrollmentDto } from '@lc/shared';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useAssign, useOpenClasses } from '../hooks';
import { ClassChoiceList } from './class-choice-list';

export interface AssignPanelProps {
  enrollment: WaitingEnrollmentDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormValues = { classId: string; overrideReason: string };

export function AssignPanel({ enrollment, open, onOpenChange }: AssignPanelProps) {
  const classes = useOpenClasses(enrollment.courseId, open);
  const assign = useAssign(enrollment.id);
  const items = classes.data?.data ?? [];
  const fit = items.filter((c) => c.level === enrollment.placementLevel);
  const other = items.filter((c) => c.level !== enrollment.placementLevel);

  const form = useForm<FormValues>({
    resolver: zodResolver(
      z
        .object({ classId: z.string(), overrideReason: z.string() })
        .superRefine((v, ctx) => {
          const isOther = other.some((c) => c.id === v.classId);
          const base = AssignClassInput.safeParse({
            classId: v.classId,
            ...(isOther ? { overrideReason: v.overrideReason } : {}),
          });
          if (!base.success) {
            for (const i of base.error.issues) ctx.addIssue({ ...i, path: i.path.length ? i.path : ['classId'] });
          } else if (isOther && !v.overrideReason.trim()) {
            ctx.addIssue({ code: 'custom', path: ['overrideReason'], message: 'Nhập lý do' });
          }
        }),
    ),
    mode: 'onChange',
    defaultValues: { classId: '', overrideReason: '' },
  });
  const classId = form.watch('classId');
  const isOther = other.some((c) => c.id === classId);

  useEffect(() => {
    if (!open) form.reset();
  }, [open, form]);

  const submit = form.handleSubmit(async (v) => {
    const input = AssignClassInput.parse({
      classId: v.classId,
      ...(isOther ? { overrideReason: v.overrideReason } : {}),
    });
    try {
      await assign.mutateAsync(input);
      toast.success(`Đã xếp ${enrollment.studentName ?? 'học viên'} vào lớp`);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CLASS_FULL') {
        toast.error('Lớp vừa đầy. Danh sách lớp đã được làm mới, chọn lớp khác.');
        form.setValue('classId', '');
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
            <DialogTitle>Xếp lớp cho {enrollment.studentName}</DialogTitle>
            <DialogDescription>
              Khóa {enrollment.courseName}, trình độ {enrollment.placementLevel ?? 'chưa có'}.
            </DialogDescription>
          </DialogHeader>
          {classes.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có lớp nào còn chỗ cho khóa học này.</p>
          ) : (
            <ClassChoiceList
              name="assign-class"
              value={classId}
              onChange={(id) => form.setValue('classId', id, { shouldValidate: true })}
              groups={[
                { label: 'Phù hợp', classes: fit },
                { label: 'Khác', classes: other },
              ]}
            />
          )}
          {isOther ? (
            <div className="space-y-1.5">
              <Label htmlFor="override-reason">Lý do xếp lớp khác trình độ</Label>
              <Textarea id="override-reason" rows={2} {...form.register('overrideReason')} />
              <p className="text-xs text-muted-foreground">Tối thiểu 5 ký tự.</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={!form.formState.isValid || !classId || assign.isPending}>
              Xếp vào lớp
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
