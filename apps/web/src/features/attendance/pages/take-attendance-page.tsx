import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AttendanceStatus, can, SessionStatus, type SessionAttendanceDto, type SessionDto } from '@lc/shared';
import { useAuth } from '@/auth/use-auth';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-messages';
import { AttendanceHistoryPopover } from '../components/attendance-history-popover';
import { StatusSegmented } from '../components/status-segmented';
import { formatSessionStart, formatShortDateTime } from '../format';
import {
  useAttendanceSession,
  useAttendanceSettings,
  useSessionAttendance,
  useTakeAttendance,
  useUpdateAttendance,
} from '../hooks';

export default function TakeAttendancePage() {
  const { id = '' } = useParams();
  const roster = useSessionAttendance(id);
  const session = useAttendanceSession(id);
  const settings = useAttendanceSettings();

  if (roster.isError)
    return (
      <>
        <PageHeader title="Điểm danh buổi học" />
        <ErrorState description={errorMessage(roster.error)} onRetry={() => void roster.refetch()} />
      </>
    );
  if (!roster.data)
    return (
      <>
        <PageHeader title="Điểm danh buổi học" />
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  // Remount the form whenever the server state changes (after a save the baseline is new).
  const key = `${roster.data.taken}|${roster.data.roster.map((r) => r.status ?? '-').join('')}`;
  return (
    <AttendanceForm
      key={key}
      sessionId={id}
      data={roster.data}
      session={session.data}
      threshold={settings.data?.attendanceWarningThreshold}
    />
  );
}

interface FormProps {
  sessionId: string;
  data: SessionAttendanceDto;
  session: SessionDto | undefined;
  threshold: number | undefined;
}

function AttendanceForm({ sessionId, data, session, threshold }: FormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const initial = useMemo(() => new Map(data.roster.map((r) => [r.studentId, r.status])), [data]);
  const [statuses, setStatuses] = useState(initial);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [sessionNote, setSessionNote] = useState(data.sessionNote ?? '');
  const [missing, setMissing] = useState(0);
  const firstButtons = useRef(new Map<string, HTMLButtonElement | null>());
  const take = useTakeAttendance(sessionId);
  const update = useUpdateAttendance(sessionId);

  const readOnly = !data.editable;
  // The edit-window message only fits a taken, live session the user could otherwise take.
  const windowClosed =
    data.taken &&
    session !== undefined &&
    session.status !== SessionStatus.CANCELLED && can(user, 'attendance.take');
  const chosen = data.roster.filter((r) => statuses.get(r.studentId)).length;
  const changed = data.roster.filter((r) => statuses.get(r.studentId) !== initial.get(r.studentId));

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setMissing(0);
    setStatuses((m) => new Map(m).set(studentId, status));
  };
  const markAllPresent = () => {
    setMissing(0);
    setStatuses(new Map(data.roster.map((r) => [r.studentId, AttendanceStatus.PRESENT])));
  };
  const onError = (e: unknown) => {
    toast.error(errorMessage(e));
    // Someone else saved first, or the edit window closed meanwhile: reload the real state.
    if (
      e instanceof ApiError &&
      (e.code === 'ATTENDANCE_ALREADY_TAKEN' || e.code === 'ATTENDANCE_EDIT_WINDOW_CLOSED')
    )
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'roster', sessionId] });
  };

  const save = () => {
    if (data.taken) {
      update.mutate(
        {
          records: changed.map((r) => {
            const reason = reasons[r.studentId]?.trim();
            return {
              studentId: r.studentId,
              status: statuses.get(r.studentId) as AttendanceStatus,
              ...(reason ? { reason } : {}),
            };
          }),
        },
        { onSuccess: () => toast.success('Đã cập nhật điểm danh'), onError },
      );
      return;
    }
    const absent = data.roster.filter((r) => !statuses.get(r.studentId));
    if (absent.length > 0) {
      setMissing(absent.length);
      const btn = firstButtons.current.get(absent[0]!.studentId);
      btn?.focus();
      btn?.scrollIntoView?.({ block: 'center' });
      return;
    }
    const note = sessionNote.trim();
    take.mutate(
      {
        records: data.roster.map((r) => ({ studentId: r.studentId, status: statuses.get(r.studentId) as AttendanceStatus })),
        ...(note ? { sessionNote: note } : {}),
      },
      { onSuccess: () => toast.success('Đã lưu điểm danh'), onError },
    );
  };

  const pending = take.isPending || update.isPending;
  return (
    <div className="pb-28">
      <PageHeader
        title={session ? `${session.classCode ?? 'Lớp'} · ${formatSessionStart(session.startAt)}` : 'Điểm danh buổi học'}
        description={
          data.taken && data.takenAt
            ? `Đã điểm danh lúc ${formatShortDateTime(data.takenAt)} bởi ${data.takenByName ?? ''}`.trim()
            : undefined
        }
      />
      {readOnly ? (
        windowClosed ? (
          <p role="status" className="mb-3 rounded-md border border-warning bg-warning/10 p-3 text-sm">
            Đã quá thời hạn chỉnh sửa
          </p>
        ) : (
          <p role="status" className="mb-3 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            Chỉ xem, không thể chỉnh sửa điểm danh
          </p>
        )
      ) : null}
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{`Đã chọn ${chosen}/${data.roster.length}`}</p>
        <Button type="button" variant="outline" className="min-h-11" disabled={readOnly} onClick={markAllPresent}>
          Tất cả có mặt
        </Button>
      </div>
      {missing > 0 ? (
        <p role="alert" className="mb-3 rounded-md border border-warning bg-warning/10 p-3 text-sm">
          {`Còn ${missing} học viên chưa điểm danh`}
        </p>
      ) : null}
      <ul className="divide-y rounded-md border">
        {data.roster.map((r) => {
          const value = statuses.get(r.studentId) ?? null;
          const showReason = data.taken && value !== initial.get(r.studentId);
          return (
            <li key={r.studentId} className="space-y-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{r.fullName}</p>
                  <p className="text-xs text-muted-foreground">{r.studentCode}</p>
                </div>
                <AttendanceHistoryPopover name={r.fullName} history={r.history} />
              </div>
              <StatusSegmented
                ref={(el) => {
                  firstButtons.current.set(r.studentId, el);
                }}
                name={r.fullName}
                value={value}
                disabled={readOnly}
                onChange={(s) => setStatus(r.studentId, s)}
              />
              {threshold !== undefined && r.absenceRate > threshold ? (
                <p className="text-sm text-warning">{`⚠ vắng ${Math.round(r.absenceRate * 100)}% số buổi`}</p>
              ) : null}
              {showReason ? (
                <Input
                  aria-label={`Lý do thay đổi: ${r.fullName}`}
                  placeholder="Lý do thay đổi"
                  maxLength={500}
                  value={reasons[r.studentId] ?? ''}
                  onChange={(e) => setReasons((m) => ({ ...m, [r.studentId]: e.target.value }))}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 space-y-1">
        <label htmlFor="session-note" className="text-sm font-medium">
          Ghi chú buổi học
        </label>
        <Textarea
          id="session-note"
          maxLength={1000}
          disabled={readOnly || data.taken}
          value={sessionNote}
          onChange={(e) => setSessionNote(e.target.value)}
        />
      </div>
      {readOnly ? null : (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3">
          <Button
            type="button"
            className="min-h-11 w-full"
            disabled={pending || (data.taken && changed.length === 0)}
            onClick={save}
          >
            {data.taken ? 'Lưu thay đổi' : 'Lưu điểm danh'}
          </Button>
        </div>
      )}
    </div>
  );
}
