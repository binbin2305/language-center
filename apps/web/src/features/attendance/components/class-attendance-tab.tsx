import { useParams } from 'react-router-dom';
import { addVnDays } from '@lc/shared';
import { useClass } from '@/features/classes/hooks';
import { AttendanceMatrix } from './attendance-matrix';
import { QueryFrame } from './summary-view';
import { useAttendanceRecords, useClassSessions } from '../hooks';

/** GET /sessions caps the range at 92 days: the matrix covers the class's first 92 days at most. */
const MAX_DAYS = 92;

/** Tab "Điểm danh" of /classes/:id: students x sessions matrix. */
export default function ClassAttendanceTab() {
  const { id = '' } = useParams();
  const cls = useClass(id);
  const from = cls.data?.startDate;
  const cap = from ? addVnDays(from, MAX_DAYS - 1) : undefined;
  const to = cls.data && cap ? (cls.data.endDate < cap ? cls.data.endDate : cap) : undefined;
  const sessions = useClassSessions(id, from, to);
  const records = useAttendanceRecords({ classId: id });
  const all = [cls, sessions, records];
  const query = all.find((q) => q.isError) ?? { ...records, isPending: all.some((q) => q.isPending) };
  const truncated = Boolean(cls.data && to && to < cls.data.endDate);
  return (
    <div className="space-y-2">
      <QueryFrame query={query} isEmpty={sessions.data?.length === 0 || records.data?.length === 0}>
        <AttendanceMatrix sessions={sessions.data ?? []} records={records.data ?? []} />
      </QueryFrame>
      {truncated ? (
        <p className="text-xs text-muted-foreground">Ma trận chỉ hiển thị 92 ngày đầu của lớp.</p>
      ) : null}
    </div>
  );
}
