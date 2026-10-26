import type { SessionConflictDto } from '@lc/shared';
import { formatInTimeZone } from 'date-fns-tz';
import { VN_TZ } from '@lc/shared';
import { formatTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

const KIND_LABEL: Record<SessionConflictDto['kind'], string> = {
  ROOM: 'Trùng phòng',
  TEACHER: 'Trùng giáo viên',
};

export function ConflictList({ conflicts }: { conflicts: SessionConflictDto[] }) {
  if (conflicts.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Danh sách xung đột lịch">
      {conflicts.map((c, i) => (
        <li
          key={`${c.sessionId ?? c.placementTestId ?? i}-${c.kind}`}
          className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
        >
          <span className="font-medium tabular-nums">{formatInTimeZone(new Date(c.startAt), VN_TZ, 'dd/MM')}</span>
          <span className="tabular-nums">{`${formatTime(c.startAt)} - ${formatTime(c.endAt)}`}</span>
          <Badge variant="outline" className="border-destructive text-destructive">
            {KIND_LABEL[c.kind]}
          </Badge>
          {c.classCode ? <span className="font-medium">{c.classCode}</span> : null}
        </li>
      ))}
    </ul>
  );
}
