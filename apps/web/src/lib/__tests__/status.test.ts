import {
  ALL_CLASS_STATUSES,
  ALL_ENROLLMENT_STATUSES,
  ALL_ATTENDANCE_STATUSES,
  ALL_INVOICE_STATUSES,
  ALL_SESSION_STATUSES,
  ALL_COURSE_STATUSES,
  ALL_ROOM_STATUSES,
  ALL_USER_STATUSES,
  ALL_LEAD_STATUSES,
  ALL_STUDENT_STATUSES,
} from '@lc/shared';
import { STATUS_LABELS, statusLabel } from '../status';

describe('STATUS_LABELS', () => {
  it('đủ mọi giá trị enum', () => {
    const pairs: [keyof typeof STATUS_LABELS, string[]][] = [
      ['class', ALL_CLASS_STATUSES],
      ['enrollment', ALL_ENROLLMENT_STATUSES],
      ['attendance', ALL_ATTENDANCE_STATUSES],
      ['invoice', ALL_INVOICE_STATUSES],
      ['session', ALL_SESSION_STATUSES],
      ['course', ALL_COURSE_STATUSES],
      ['room', ALL_ROOM_STATUSES],
      ['user', ALL_USER_STATUSES],
      ['lead', ALL_LEAD_STATUSES],
      ['student', ALL_STUDENT_STATUSES],
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
  it('nhóm danh mục, lead, học viên theo contract request L-CATALOG-1 / L-ADMISSIONS-1', () => {
    expect(STATUS_LABELS.course).toEqual({
      ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
      ARCHIVED: { label: 'Đã lưu trữ', tone: 'muted' },
    });
    expect(STATUS_LABELS.room).toEqual({
      ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
      INACTIVE: { label: 'Ngừng hoạt động', tone: 'muted' },
    });
    expect(STATUS_LABELS.user).toEqual({
      ACTIVE: { label: 'Đang hoạt động', tone: 'success' },
      LOCKED: { label: 'Đã khóa', tone: 'destructive' },
      DISABLED: { label: 'Đã vô hiệu', tone: 'muted' },
    });
    expect(STATUS_LABELS.lead).toEqual({
      NEW: { label: 'Mới', tone: 'info' },
      PROFILE_CREATED: { label: 'Đã tạo hồ sơ', tone: 'success' },
      CANCELLED: { label: 'Đã hủy', tone: 'muted' },
    });
    expect(STATUS_LABELS.student).toEqual({
      ACTIVE: { label: 'Đang học', tone: 'success' },
      RESERVED: { label: 'Bảo lưu', tone: 'muted' },
      DROPPED: { label: 'Đã nghỉ', tone: 'destructive' },
      COMPLETED: { label: 'Hoàn thành', tone: 'primary' },
    });
  });
  it('statusLabel trả nhãn tiếng Việt, giá trị lạ trả nguyên văn', () => {
    expect(statusLabel('lead', 'NEW')).toBe('Mới');
    expect(statusLabel('user', 'LOCKED')).toBe('Đã khóa');
    expect(statusLabel('student', 'UNKNOWN')).toBe('UNKNOWN');
  });
});
