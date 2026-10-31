import { EnrollmentStatus as E } from '@lc/shared';
import { enrolledAt } from './roster';

const d = (day: string) => new Date(`2026-01-${day}T03:00:00Z`);
const h = (from: E | null, to: E, day: string) => ({ from, to, at: d(day) });

describe('D13 enrolledAt (roster theo thời điểm)', () => {
  it('ENROLLED từ 01/01, buổi 05/01 -> true', () => {
    expect(enrolledAt([h(E.WAITING_CLASS, E.ENROLLED, '01')], d('05'))).toBe(true);
  });
  it('TRANSFERRED 03/01, buổi 05/01 -> false', () => {
    expect(enrolledAt([h(E.WAITING_CLASS, E.ENROLLED, '01'), h(E.ENROLLED, E.TRANSFERRED, '03')], d('05'))).toBe(false);
  });
  it('TRANSFERRED 10/01, buổi 05/01 -> true', () => {
    expect(enrolledAt([h(E.WAITING_CLASS, E.ENROLLED, '01'), h(E.ENROLLED, E.TRANSFERRED, '10')], d('05'))).toBe(true);
  });
  it('enrolled 06/01, buổi 05/01 -> false', () => {
    expect(enrolledAt([h(E.WAITING_CLASS, E.ENROLLED, '06')], d('05'))).toBe(false);
  });
  it('ENROLLED->RESERVED->WAITING_CLASS->ENROLLED: giữa hai đoạn false, trong đoạn hai true', () => {
    const hist = [
      h(null, E.ENROLLED, '01'),
      h(E.ENROLLED, E.RESERVED, '03'),
      h(E.RESERVED, E.WAITING_CLASS, '04'),
      h(E.WAITING_CLASS, E.ENROLLED, '08'),
    ];
    expect(enrolledAt(hist, d('02'))).toBe(true);
    expect(enrolledAt(hist, d('05'))).toBe(false);
    expect(enrolledAt(hist, d('09'))).toBe(true);
  });
  it('COMPLETED không đóng đoạn', () => {
    expect(enrolledAt([h(null, E.ENROLLED, '01'), h(E.ENROLLED, E.COMPLETED, '03')], d('05'))).toBe(true);
  });
  it('không có history -> false', () => {
    expect(enrolledAt([], d('05'))).toBe(false);
  });
});
