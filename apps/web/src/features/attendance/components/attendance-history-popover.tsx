import { History } from 'lucide-react';
import type { AttendanceHistoryEntry } from '@lc/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatShortDateTime } from '../format';
import { statusLabel } from '@/lib/status';

const label = (s: string) => statusLabel('attendance', s);
const stamp = formatShortDateTime;

export function AttendanceHistoryPopover({ name, history }: { name: string; history: AttendanceHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Lịch sử ${name}`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
      >
        <History className="h-4 w-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <ol aria-label="Lịch sử điểm danh" className="space-y-2 text-sm">
          {history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <p className="font-medium">{h.from ? `${label(h.from)} → ${label(h.to)}` : label(h.to)}</p>
              <p className="text-xs text-muted-foreground">
                {stamp(h.at)}
                {h.reason ? ` · ${h.reason}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
