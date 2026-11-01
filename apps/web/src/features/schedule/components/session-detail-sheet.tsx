import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { can, type SessionDto } from '@lc/shared';
import { useAuth } from '@/auth/use-auth';
import { ReasonDialog } from '@/components/common/reason-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { errorMessage } from '@/lib/error-messages';
import { formatDate, formatTime } from '@/lib/format';
import { useCancelSession } from '../hooks';
import { SessionFormDialog } from './session-form-dialog';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export interface SessionDetailSheetProps {
  session: SessionDto | null;
  onClose: () => void;
}

export function SessionDetailSheet({ session, onClose }: SessionDetailSheetProps) {
  const { user } = useAuth();
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const cancel = useCancelSession();
  const scheduled = session?.status === 'SCHEDULED';

  return (
    <>
      <Sheet open={session !== null} onOpenChange={(o) => !o && onClose()}>
        <SheetContent>
          {session ? (
            <>
              <SheetHeader>
                <SheetTitle>Chi tiết buổi học</SheetTitle>
                <SheetDescription>{session.classCode ?? 'Buổi học'}</SheetDescription>
              </SheetHeader>
              <dl className="mt-4 space-y-3">
                <Row label="Ngày">{formatDate(session.startAt)}</Row>
                <Row label="Giờ">{`${formatTime(session.startAt)} - ${formatTime(session.endAt)}`}</Row>
                <Row label="Phòng">{session.roomName ?? '—'}</Row>
                <Row label="Giáo viên">{session.teacherName ?? '—'}</Row>
                <Row label="Trạng thái"><StatusBadge group="session" value={session.status} /></Row>
                {session.cancelReason ? <Row label="Lý do hủy">{session.cancelReason}</Row> : null}
              </dl>
              <SheetFooter className="mt-6 gap-2 sm:gap-0">
                {scheduled && can(user, 'attendance.take') ? (
                  <Button asChild className="min-h-11">
                    <Link to={`/sessions/${session.id}/attendance`}>Điểm danh</Link>
                  </Button>
                ) : null}
                {scheduled && can(user, 'sessions.manage') ? (
                  <>
                    <Button variant="outline" onClick={() => setEditing(true)}>Sửa</Button>
                    <Button variant="destructive" onClick={() => setCancelling(true)}>Hủy buổi</Button>
                  </>
                ) : null}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
      {session ? (
        <>
          <ReasonDialog
            open={cancelling}
            onOpenChange={setCancelling}
            title="Hủy buổi học"
            description="Học viên và giáo viên sẽ được thông báo. Nhập lý do hủy."
            submitLabel="Xác nhận hủy"
            isPending={cancel.isPending}
            onSubmit={(reason) =>
              cancel.mutate(
                { id: session.id, reason },
                {
                  onSuccess: () => {
                    toast.success('Đã hủy buổi học');
                    setCancelling(false);
                    onClose();
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          />
          <SessionFormDialog
            open={editing}
            onOpenChange={(o) => {
              setEditing(o);
              if (!o) onClose();
            }}
            session={session}
          />
        </>
      ) : null}
    </>
  );
}
