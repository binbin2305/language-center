import type { DashboardDto } from '@lc/shared';
import { formatTime } from '@/lib/format';

export function TodaySessionsTable({ sessions }: { sessions: DashboardDto['todaySessions'] }) {
  if (sessions.length === 0)
    return (
      <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
        Hôm nay không có buổi học
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table aria-label="Buổi học hôm nay" className="w-full text-sm">
        <thead className="border-b text-left text-muted-foreground">
          <tr>
            {['Giờ', 'Lớp', 'Phòng', 'Giáo viên', 'Đã điểm danh'].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.sessionId} className="border-b last:border-0">
              <td className="px-3 py-2 tabular-nums">
                {formatTime(s.startAt)} - {formatTime(s.endAt)}
              </td>
              <td className="px-3 py-2">{s.classCode}</td>
              <td className="px-3 py-2">{s.roomCode ?? '—'}</td>
              <td className="px-3 py-2">{s.teacherName ?? '—'}</td>
              <td className="px-3 py-2">{s.attendanceTaken ? 'Đã điểm danh' : 'Chưa điểm danh'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
