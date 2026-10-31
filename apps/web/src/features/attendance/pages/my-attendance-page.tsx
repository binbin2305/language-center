import { PageHeader } from '@/components/common/page-header';
import { QueryFrame } from '../components/summary-view';
import { RecordsList } from '../components/records-list';
import { percent } from '../components/summary-table';
import { useAttendanceRecords, useAttendanceSummary } from '../hooks';

export default function MyAttendancePage() {
  const summary = useAttendanceSummary({ groupBy: 'student' });
  const row = summary.data?.[0];
  const records = useAttendanceRecords({}, Boolean(row));
  return (
    <>
      <PageHeader title="Điểm danh của tôi" />
      <QueryFrame query={summary} isEmpty={!row}>
        {row ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Tỷ lệ chuyên cần</p>
              <p className="text-3xl font-semibold">{percent(row.attendanceRate)}</p>
              <p className="text-sm text-muted-foreground">
                {`${row.PRESENT} có mặt · ${row.LATE} muộn · ${row.EXCUSED} vắng có phép · ${row.UNEXCUSED} vắng không phép`}
              </p>
            </div>
            <RecordsList label="Các buổi đã học" records={records.data ?? []} showClass />
          </div>
        ) : null}
      </QueryFrame>
    </>
  );
}
