import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { can, type SessionDto } from '@lc/shared';
import { useAuth } from '@/auth/use-auth';
import { ReasonDialog } from '@/components/common/reason-dialog';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/error-messages';
import { useCancelFutureSessions } from '../hooks';
import { ScheduleCalendar } from './schedule-calendar';
import { SessionDetailSheet } from './session-detail-sheet';
import { SessionFormDialog } from './session-form-dialog';

/** Tab "Lịch học" of /classes/:id (DESIGN §4.5, §4.6). */
export default function ClassScheduleTab() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const manage = can(user, 'sessions.manage');
  const [selected, setSelected] = useState<SessionDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancellingFuture, setCancellingFuture] = useState(false);
  const cancelFuture = useCancelFutureSessions();

  return (
    <div className="space-y-3">
      {manage ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setCancellingFuture(true)}>Hủy các buổi sắp tới</Button>
          <Button onClick={() => setCreating(true)}>Tạo lịch</Button>
        </div>
      ) : null}
      <ScheduleCalendar filters={{ classId: id }} onSelectSession={setSelected} />
      <SessionDetailSheet session={selected} onClose={() => setSelected(null)} />
      {manage ? (
        <>
          <SessionFormDialog open={creating} onOpenChange={setCreating} defaults={{ classId: id }} lockClass />
          <ReasonDialog
            open={cancellingFuture}
            onOpenChange={setCancellingFuture}
            title="Hủy các buổi sắp tới"
            description="Tất cả buổi chưa diễn ra của lớp sẽ bị hủy. Nhập lý do."
            submitLabel="Xác nhận hủy"
            isPending={cancelFuture.isPending}
            onSubmit={(reason) =>
              cancelFuture.mutate(
                { classId: id, reason },
                {
                  onSuccess: (r) => {
                    toast.success(`Đã hủy ${r.cancelled} buổi`);
                    setCancellingFuture(false);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          />
        </>
      ) : null}
    </div>
  );
}
