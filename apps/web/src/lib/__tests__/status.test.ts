import {
  ALL_CLASS_STATUSES,
  ALL_ENROLLMENT_STATUSES,
  ALL_ATTENDANCE_STATUSES,
  ALL_INVOICE_STATUSES,
  ALL_SESSION_STATUSES,
} from '@lc/shared';
import { STATUS_LABELS } from '../status';

describe('STATUS_LABELS', () => {
  it('đủ mọi giá trị enum', () => {
    const pairs: [keyof typeof STATUS_LABELS, string[]][] = [
      ['class', ALL_CLASS_STATUSES],
      ['enrollment', ALL_ENROLLMENT_STATUSES],
      ['attendance', ALL_ATTENDANCE_STATUSES],
      ['invoice', ALL_INVOICE_STATUSES],
      ['session', ALL_SESSION_STATUSES],
    ];
    for (const [g, values] of pairs) {
      for (const v of values) expect(STATUS_LABELS[g][v], `${g}.${v}`).toBeDefined();
    }
  });
  it('theo DESIGN §2', () => {
    expect(STATUS_LABELS.class.ONGOING).toEqual({ label: 'Đang học', tone: 'success' });
    expect(STATUS_LABELS.enrollment.WAITING_CLASS).toEqual({
      label: 'Chờ xếp lớp',
      tone: 'warning',
    });
    expect(STATUS_LABELS.attendance.EXCUSED).toEqual({ label: 'Vắng có phép', tone: 'info' });
    expect(STATUS_LABELS.invoice.PARTIAL).toEqual({
      label: 'Thanh toán một phần',
      tone: 'warning',
    });
    expect(STATUS_LABELS.invoice.OVERDUE).toEqual({
      label: 'Quá hạn',
      tone: 'destructive',
      outline: true,
    });
    expect(STATUS_LABELS.session.CANCELLED.strike).toBe(true);
    expect(STATUS_LABELS.session.COMPLETED.label).toBe('Đã học');
  });
});
