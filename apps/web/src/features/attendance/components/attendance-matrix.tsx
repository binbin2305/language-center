import type { AttendanceDto, ClassStudentDto, SessionDto } from '@lc/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATUS_LABELS } from '@/lib/status';
import { formatSessionStart } from '../format';

const SHORT: Record<string, string> = { PRESENT: 'CM', LATE: 'M', EXCUSED: 'CP', UNEXCUSED: 'KP' };
const TONE: Record<string, string> = {
  PRESENT: 'bg-success/15 text-success',
  LATE: 'bg-warning/15 text-warning',
  EXCUSED: 'bg-info/15 text-info',
  UNEXCUSED: 'bg-destructive/15 text-destructive',
};

/** Rows = class roster ∪ students with records, columns = the class's sessions; no record = empty cell. */
export function AttendanceMatrix({
  sessions,
  records,
  roster = [],
}: {
  sessions: SessionDto[];
  records: AttendanceDto[];
  roster?: ClassStudentDto[];
}) {
  const students = new Map<string, string>();
  for (const s of roster) students.set(s.studentId, s.fullName);
  const cell = new Map<string, AttendanceDto['status']>();
  for (const r of records) {
    students.set(r.studentId, r.studentName ?? r.studentId);
    cell.set(`${r.studentId}|${r.sessionId}`, r.status);
  }
  const cols = [...sessions].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const rows = [...students].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table aria-label="Ma trận điểm danh">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">Học viên</TableHead>
            {cols.map((s) => (
              <TableHead key={s.id} className="whitespace-nowrap text-center text-xs">
                {formatSessionStart(s.startAt)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([id, name]) => (
            <TableRow key={id}>
              <TableCell className="sticky left-0 whitespace-nowrap bg-background font-medium">{name}</TableCell>
              {cols.map((s) => {
                const status = cell.get(`${id}|${s.id}`);
                return status ? (
                  <TableCell
                    key={s.id}
                    data-status={status}
                    title={STATUS_LABELS.attendance[status]?.label}
                    className={`text-center text-xs font-medium ${TONE[status]}`}
                  >
                    {SHORT[status]}
                  </TableCell>
                ) : (
                  <TableCell key={s.id} data-status="NONE" />
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
