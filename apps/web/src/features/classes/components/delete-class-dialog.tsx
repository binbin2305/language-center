import { useState } from 'react';
import { toast } from 'sonner';
import type { ClassDependencyReason } from '@lc/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { useDeactivateClass, useDeleteClass } from '../hooks';

export const DEPENDENCY_LABELS: Record<ClassDependencyReason, string> = {
  ACTIVE_STUDENTS: 'Còn học viên đang học',
  ENROLLMENT_HISTORY: 'Lớp đã có lịch sử học viên',
  SESSIONS: 'Đã có buổi học',
  GRADES: 'Đã có điểm',
  INVOICES: 'Đã có hóa đơn',
};

export interface DeleteClassDialogProps {
  classId: string;
  className: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteClassDialog({ classId, className, open, onOpenChange, onDeleted }: DeleteClassDialogProps) {
  const [reasons, setReasons] = useState<ClassDependencyReason[] | null>(null);
  const del = useDeleteClass();
  const deactivate = useDeactivateClass();

  const close = (next: boolean) => {
    if (!next) setReasons(null);
    onOpenChange(next);
  };

  const confirmDelete = async () => {
    try {
      await del.mutateAsync(classId);
      toast.success('Đã xóa lớp học');
      close(false);
      onDeleted?.();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CLASS_HAS_DEPENDENCIES') {
        const list = e.details?.reasons;
        setReasons(Array.isArray(list) ? (list as ClassDependencyReason[]) : []);
      } else {
        toast.error(errorMessage(e));
        close(false);
      }
    }
  };

  const switchToInactive = async () => {
    try {
      await deactivate.mutateAsync(classId);
      toast.success('Đã chuyển lớp sang Ngừng hoạt động');
      close(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (reasons === null)
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title="Xóa lớp học"
        description={`Bạn chắc chắn muốn xóa lớp ${className}? Thao tác này không thể hoàn tác.`}
        confirmLabel="Xóa lớp"
        destructive
        isPending={del.isPending}
        onConfirm={() => void confirmDelete()}
      />
    );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Không thể xóa lớp</DialogTitle>
          <DialogDescription>
            Lớp {className} chưa thể xóa vì các lý do sau. Bạn có thể chuyển lớp sang Ngừng hoạt động để giữ lại lịch sử.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {reasons.map((r) => (
            <li key={r}>{DEPENDENCY_LABELS[r] ?? r}</li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Đóng
          </Button>
          <Button type="button" disabled={deactivate.isPending} onClick={() => void switchToInactive()}>
            Chuyển sang Ngừng hoạt động
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
