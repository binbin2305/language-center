import type { AttendanceStatus } from './enums';

export type AttendanceCounts = Partial<Record<AttendanceStatus, number>>;

const total = (c: AttendanceCounts) => Object.values(c).reduce<number>((a, n) => a + (n ?? 0), 0);

/** (EXCUSED + UNEXCUSED) / all records; 0 when there are no records (D6). */
export function absenceRate(c: AttendanceCounts): number {
  const t = total(c);
  return t === 0 ? 0 : ((c.EXCUSED ?? 0) + (c.UNEXCUSED ?? 0)) / t;
}

/** (PRESENT + LATE) / all records; null when there are no records (D7). */
export function attendanceRate(c: AttendanceCounts): number | null {
  const t = total(c);
  return t === 0 ? null : ((c.PRESENT ?? 0) + (c.LATE ?? 0)) / t;
}
