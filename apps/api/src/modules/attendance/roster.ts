import { EnrollmentStatus } from '@lc/shared';

interface HistoryItem {
  from: EnrollmentStatus | null;
  to: EnrollmentStatus;
  at: Date;
  /** R22: class of the stint this entry opens (absent on legacy rows). */
  classId?: { toString(): string } | null;
}

/** Restricts stints to one class: stamped stints match by classId, legacy (unstamped) ones iff `legacy`. */
export interface StintClass {
  classId: { toString(): string };
  legacy: boolean;
}

const CLOSING: EnrollmentStatus[] = [EnrollmentStatus.TRANSFERRED, EnrollmentStatus.RESERVED, EnrollmentStatus.CANCELLED];

/**
 * D13: true when `instant` falls inside an ENROLLED span of the enrollment history.
 * A span opens at an entry `to: ENROLLED` and closes (exclusive) at the next entry `from: ENROLLED`
 * to TRANSFERRED | RESERVED | CANCELLED. COMPLETED does not close a span.
 * With `inClass` (R22), only spans seated in that class count.
 */
export function enrolledAt(history: HistoryItem[], instant: Date, inClass?: StintClass): boolean {
  const t = instant.getTime();
  const sorted = [...history].sort((a, b) => a.at.getTime() - b.at.getTime());
  const counts = (h: HistoryItem): boolean => {
    if (!inClass) return true;
    return h.classId ? h.classId.toString() === inClass.classId.toString() : inClass.legacy;
  };
  let openedAt: number | null = null;
  let open: HistoryItem | null = null;
  for (const h of sorted) {
    if (h.to === EnrollmentStatus.ENROLLED && h.from !== EnrollmentStatus.ENROLLED) {
      if (openedAt === null) {
        openedAt = h.at.getTime();
        open = h;
      }
    } else if (h.from === EnrollmentStatus.ENROLLED && CLOSING.includes(h.to)) {
      if (openedAt !== null && open && counts(open) && openedAt <= t && t < h.at.getTime()) return true;
      openedAt = null;
      open = null;
    }
  }
  return openedAt !== null && !!open && counts(open) && openedAt <= t;
}
