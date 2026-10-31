import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { can, canTransition, ENROLLMENT_TRANSITIONS, type EnrollmentDto } from '@lc/shared';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { useEnrollments, useResume } from '../hooks';
import { TransferDialog } from './transfer-dialog';
import { WithdrawDialog } from './withdraw-dialog';

type Action = { kind: 'transfer' | 'reserve' | 'cancel'; enrollment: EnrollmentDto } | null;

/** Tab "Khóa học & lớp" of the student detail page. */
export default function StudentEnrollmentsTab() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const manage = can(user, 'enrollments.assign');
  const q = useEnrollments({ studentId: id, limit: 100 });
  const resume = useResume();
  const [action, setAction] = useState<Action>(null);

  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
  const rows = q.data?.data ?? [];
  if (rows.length === 0) return <EmptyState title="Chưa đăng ký khóa học" />;

  const close = (o: boolean) => !o && setAction(null);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Khóa học & lớp</h2>
      <ul className="space-y-2">
        {rows.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="font-medium">{e.courseName}</p>
              <p className="text-sm text-muted-foreground">{e.className ?? 'Chưa có lớp'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge group="enrollment" value={e.status} />
              {manage && e.status === 'ENROLLED' ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'transfer', enrollment: e })}>
                    Chuyển lớp
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'reserve', enrollment: e })}>
                    Bảo lưu
                  </Button>
                </>
              ) : null}
              {manage && e.status === 'RESERVED' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resume.isPending}
                  onClick={() =>
                    resume.mutate(e.id, {
                      onSuccess: () => toast.success('Đã đưa học viên vào danh sách chờ xếp lớp'),
                      onError: (err) => toast.error(errorMessage(err)),
                    })
                  }
                >
                  Học lại
                </Button>
              ) : null}
              {manage && canTransition(ENROLLMENT_TRANSITIONS, e.status, 'CANCELLED') ? (
                <Button size="sm" variant="outline" onClick={() => setAction({ kind: 'cancel', enrollment: e })}>
                  Rút
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {action?.kind === 'transfer' ? <TransferDialog enrollment={action.enrollment} open onOpenChange={close} /> : null}
      {action && action.kind !== 'transfer' ? (
        <WithdrawDialog
          enrollmentId={action.enrollment.id}
          status={action.kind === 'cancel' ? 'CANCELLED' : 'RESERVED'}
          open
          onOpenChange={close}
        />
      ) : null}
    </div>
  );
}
