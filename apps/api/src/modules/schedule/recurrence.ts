import { addVnDays, vnDateTime } from '@lc/shared';

export interface WeeklyRecurrence {
  /** ISO weekdays: 1=Monday .. 7=Sunday. Duplicates are ignored. */
  weekdays: number[];
  startTime: string;
  endTime: string;
  fromDate: string;
  toDate: string;
}

/** ISO weekday (1=Mon..7=Sun) of a 'YYYY-MM-DD' calendar day. */
function isoWeekday(day: string): number {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Expands a weekly pattern into concrete sessions (Vietnam wall-clock times), ascending, one per matching day. */
export function expandWeekly(input: WeeklyRecurrence): Array<{ startAt: Date; endAt: Date }> {
  if (input.endTime <= input.startTime) throw new RangeError('endTime must be after startTime');
  const wanted = new Set(input.weekdays);
  const out: Array<{ startAt: Date; endAt: Date }> = [];
  for (let day = input.fromDate; day <= input.toDate; day = addVnDays(day, 1)) {
    if (!wanted.has(isoWeekday(day))) continue;
    out.push({ startAt: vnDateTime(day, input.startTime), endAt: vnDateTime(day, input.endTime) });
  }
  return out;
}
