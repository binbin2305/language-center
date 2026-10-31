import { useParams } from 'react-router-dom';
import { useClass } from '@/features/classes/hooks';
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
  const all = [cls, sessions, records];
  const query = all.find((q) => q.isError) ?? { ...records, isPending: all.some((q) => q.isPending) };
  return (
    <div className="space-y-2">
      <QueryFrame query={query} isEmpty={sessions.data?.length === 0 || records.data?.length === 0}>
        <AttendanceMatrix sessions={sessions.data ?? []} records={records.data ?? []} />
      </QueryFrame>
    </div>
  );
}
