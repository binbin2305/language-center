import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/error-messages';
import { useAddCandidates, usePendingEnrollments } from '../hooks';

export interface CandidatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  courseId: string;
  /** Enrollments already in this test. */
  existing: string[];
}

export function CandidatesDialog({ open, onOpenChange, testId, courseId, existing }: CandidatesDialogProps) {
  const pending = usePendingEnrollments(open ? courseId : undefined);
  const add = useAddCandidates(testId);
  const [picked, setPicked] = useState<string[]>([]);
  const rows = (pending.data?.data ?? []).filter((e) => !existing.includes(e.id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    try {
      await add.mutateAsync({ enrollmentIds: picked });
      toast.success(`Đã thêm ${picked.length} thí sinh`);
      setPicked([]);
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm thí sinh</DialogTitle>
        </DialogHeader>
        {pending.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : pending.isError ? (
          <ErrorState onRetry={() => void pending.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState title="Chưa có học viên chờ kiểm tra" description="Không có đăng ký nào đang chờ kiểm tra đầu vào của khóa này." />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto" aria-label="Học viên chờ kiểm tra">
            {rows.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <Checkbox
                  id={`cand-${e.id}`}
                  checked={picked.includes(e.id)}
                  onCheckedChange={() => toggle(e.id)}
                  aria-label={e.studentName ?? e.id}
                />
                <label htmlFor={`cand-${e.id}`} className="text-sm">
                  {[e.studentCode, e.studentName].filter(Boolean).join(' - ') || e.id}
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button type="button" disabled={picked.length === 0 || add.isPending} onClick={() => void submit()}>
            Thêm vào đợt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
