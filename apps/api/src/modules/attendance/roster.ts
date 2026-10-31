import { EnrollmentStatus } from '@lc/shared';

interface HistoryItem {
  from: EnrollmentStatus | null;
  to: EnrollmentStatus;
  at: Date;
}

const CLOSING: EnrollmentStatus[] = [EnrollmentStatus.TRANSFERRED, EnrollmentStatus.RESERVED, EnrollmentStatus.CANCELLED];

/**
 * D13: true when `instant` falls inside an ENROLLED span of the enrollment history.
 * A span opens at an entry `to: ENROLLED` and closes (exclusive) at the next entry `from: ENROLLED`
 * to TRANSFERRED | RESERVED | CANCELLED. COMPLETED does not close a span.
 */
export function enrolledAt(history: HistoryItem[], instant: Date): boolean {
  const t = instant.getTime();
  const sorted = [...history].sort((a, b) => a.at.getTime() - b.at.getTime());
  let openedAt: number | null = null;
  for (const h of sorted) {
    if (h.to === EnrollmentStatus.ENROLLED && h.from !== EnrollmentStatus.ENROLLED) {
      if (openedAt === null) openedAt = h.at.getTime();
    } else if (h.from === EnrollmentStatus.ENROLLED && CLOSING.includes(h.to)) {
      if (openedAt !== null && openedAt <= t && t < h.at.getTime()) return true;
      openedAt = null;
    }
  }
  return openedAt !== null && openedAt <= t;
}
