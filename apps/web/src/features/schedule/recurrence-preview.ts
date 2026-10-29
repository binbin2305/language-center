import { addVnDays, BulkCreateSessionsInput, vnDateTime } from '@lc/shared';

type Recurrence = Pick<BulkCreateSessionsInput, 'weekdays' | 'fromDate' | 'toDate'>;

const validDay = (day: string) => BulkCreateSessionsInput.shape.fromDate.safeParse(day).success;

/** ISO weekday (1=Mon..7=Sun) of a 'YYYY-MM-DD' calendar day. */
function isoWeekday(day: string): number {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/**
 * Calendar days a weekly pattern lands on. Same rule as the server's expandWeekly:
 * duplicate weekdays collapse, both ends inclusive, empty when the range is reversed or incomplete.
 */
export function recurrenceDays({ weekdays, fromDate, toDate }: Recurrence): string[] {
  if (!validDay(fromDate) || !validDay(toDate)) return [];
  const wanted = new Set(weekdays);
  const days: string[] = [];
  for (let day = fromDate; day <= toDate; day = addVnDays(day, 1)) {
    if (wanted.has(isoWeekday(day))) days.push(day);
  }
  return days;
}

export function countRecurrence(input: Recurrence): number {
  return recurrenceDays(input).length;
}

/** Concrete [startAt, endAt] ISO instants (Vietnam wall-clock) for each recurrence day. */
export function recurrenceSlots(
  input: Recurrence & Pick<BulkCreateSessionsInput, 'startTime' | 'endTime'>,
): Array<{ startAt: string; endAt: string }> {
  return recurrenceDays(input).map((day) => ({
    startAt: vnDateTime(day, input.startTime).toISOString(),
    endAt: vnDateTime(day, input.endTime).toISOString(),
  }));
}
