import type { AttendanceDto } from '@lc/shared';
import { StatusBadge } from '@/components/common/status-badge';
import { formatSessionStart } from '../format';

/** Per-session attendance list (one row per record). */
export function RecordsList({ label, records, showClass }: { label: string; records: AttendanceDto[]; showClass?: boolean }) {
  const sorted = [...records].sort((a, b) => (b.sessionStartAt ?? '').localeCompare(a.sessionStartAt ?? ''));
  return (
    <ul aria-label={label} className="divide-y rounded-md border">
      {sorted.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
          <span>
            {r.sessionStartAt ? formatSessionStart(r.sessionStartAt) : ''}
            {showClass && r.classCode ? ` · ${r.classCode}` : ''}
          </span>
          <StatusBadge group="attendance" value={r.status} />
        </li>
      ))}
    </ul>
  );
}
