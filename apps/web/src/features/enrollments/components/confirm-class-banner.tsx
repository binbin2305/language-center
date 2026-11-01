import { toast } from 'sonner';
import { can } from '@lc/shared';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { useConfirm, useMyEnrollments } from '../hooks';

/** Banner asking the student to confirm each newly assigned class (D19). Renders nothing when none is pending. */
export function ConfirmClassBanner() {
  const { user } = useAuth();
  const allowed = can(user, 'enrollments.confirm');
  const mine = useMyEnrollments();
  const confirm = useConfirm();
  if (!allowed) return null;
  const pending = (mine.data ?? []).filter((e) => e.status === 'ENROLLED' && !e.confirmedAt);
  if (pending.length === 0) return null;

  return (
    <div className="space-y-2" role="region" aria-label="Xác nhận lớp">
      {pending.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning bg-warning/10 p-3">
          <p className="text-sm">
            Bạn đã được xếp vào lớp <strong>{e.className ?? 'mới'}</strong>. Vui lòng xác nhận để hoàn tất.
          </p>
          <Button
            className="min-h-11"
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate(e.id, {
                onSuccess: () => toast.success('Đã xác nhận lớp'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            Xác nhận lớp
          </Button>
        </div>
      ))}
    </div>
  );
}
