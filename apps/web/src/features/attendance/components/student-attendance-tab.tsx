import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { QueryFrame } from './summary-view';
import { RecordsList } from './records-list';
import { SummaryTable } from './summary-table';
import { useAttendanceRecords, useAttendanceSummary } from '../hooks';

/** Tab "Chuyên cần" of /students/:id: per-class summary, then the sessions. */
export default function StudentAttendanceTab() {
  const { id = '' } = useParams();
  const [classId, setClassId] = useState<string | null>(null);
  const summary = useAttendanceSummary({ groupBy: 'class', studentId: id });
  const records = useAttendanceRecords({ studentId: id, ...(classId ? { classId } : {}) });
  return (
    <div className="space-y-4">
      <QueryFrame query={summary} isEmpty={summary.data?.length === 0}>
        <SummaryTable
          labelHeader="Lớp"
          rows={summary.data ?? []}
          selectedKey={classId}
          onSelect={(r) => setClassId((cur) => (cur === r.key ? null : r.key))}
        />
        <RecordsList label="Các buổi đã học" records={records.data ?? []} showClass />
      </QueryFrame>
    </div>
  );
}
