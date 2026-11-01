import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useClass, useClassRoster } from '@/features/classes/hooks';
import { AttendanceMatrix } from './attendance-matrix';
import { QueryFrame } from './summary-view';
import { useAttendanceRecords, useClassSessions } from '../hooks';

/** Tab "Điểm danh" of /classes/:id: students x sessions matrix. */
export default function ClassAttendanceTab() {
  const { id = '' } = useParams();
  const cls = useClass(id);
  // Sessions are fetched in ≤92-day windows covering the whole class span.
  const sessions = useClassSessions(id, cls.data?.startDate, cls.data?.endDate);
  const records = useAttendanceRecords({ classId: id });
  const roster = useClassRoster(id, 1, 100);
  // A failed roster only degrades the matrix (rows come from the records) — it must not hide it.
  const all = [cls, sessions, records];
  const query = all.find((q) => q.isError) ?? { ...records, isPending: [...all, roster].some((q) => q.isPending) };
  return (
    <div className="space-y-2">
      {roster.isError && !query.isPending ? (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>Không tải được danh sách lớp</span>
          <Button variant="outline" size="sm" onClick={() => void roster.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : null}
      <QueryFrame query={query} isEmpty={sessions.data?.length === 0}>
        <AttendanceMatrix sessions={sessions.data ?? []} records={records.data ?? []} roster={roster.data?.data ?? []} />
      </QueryFrame>
    </div>
  );
}
