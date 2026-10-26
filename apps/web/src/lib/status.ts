export type StatusTone = 'success' | 'warning' | 'info' | 'destructive' | 'muted' | 'primary';
export type StatusGroup = 'class' | 'enrollment' | 'attendance' | 'invoice' | 'session';
export interface StatusMeta {
  label: string;
  tone: StatusTone;
  /** Render with an outline style (invoice overdue). */
  outline?: boolean;
  /** Render label struck through (cancelled session). */
  strike?: boolean;
}

// Source of truth: DESIGN.md section 2 (badge table).
export const STATUS_LABELS: Record<StatusGroup, Record<string, StatusMeta>> = {
  class: {
    PLANNED: { label: 'Chờ mở', tone: 'info' },
    ONGOING: { label: 'Đang học', tone: 'success' },
    FINISHED: { label: 'Đã kết thúc', tone: 'muted' },
    INACTIVE: { label: 'Ngừng hoạt động', tone: 'muted' },
  },
  enrollment: {
    PENDING_PLACEMENT: { label: 'Chờ kiểm tra', tone: 'info' },
    WAITING_CLASS: { label: 'Chờ xếp lớp', tone: 'warning' },
    ENROLLED: { label: 'Đang học', tone: 'success' },
    TRANSFERRED: { label: 'Đã chuyển lớp', tone: 'muted' },
    RESERVED: { label: 'Bảo lưu', tone: 'muted' },
    COMPLETED: { label: 'Hoàn thành', tone: 'primary' },
    CANCELLED: { label: 'Đã hủy', tone: 'destructive' },
  },
  attendance: {
    PRESENT: { label: 'Có mặt', tone: 'success' },
    LATE: { label: 'Đi muộn', tone: 'warning' },
    EXCUSED: { label: 'Vắng có phép', tone: 'info' },
    UNEXCUSED: { label: 'Vắng không phép', tone: 'destructive' },
  },
  invoice: {
    UNPAID: { label: 'Chưa thanh toán', tone: 'destructive' },
    PARTIAL: { label: 'Thanh toán một phần', tone: 'warning' },
    PAID: { label: 'Đã thanh toán', tone: 'success' },
    VOID: { label: 'Đã hủy', tone: 'muted' },
    OVERDUE: { label: 'Quá hạn', tone: 'destructive', outline: true },
  },
  session: {
    SCHEDULED: { label: 'Đã lên lịch', tone: 'info' },
    CANCELLED: { label: 'Đã hủy', tone: 'muted', strike: true },
    COMPLETED: { label: 'Đã học', tone: 'success' },
  },
};
