import type { Gender, StudentStatus } from '@lc/shared';

export const GENDER_LABELS: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

// TODO W1-MERGE: replace with StatusBadge group="student" once lib/status.ts has it
// (see docs/contract-requests/L-ADMISSIONS-1.md).
export const STUDENT_STATUS_LABELS: Record<StudentStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Đang học', className: 'border-transparent bg-success/15 text-success' },
  RESERVED: { label: 'Bảo lưu', className: 'border-transparent bg-muted text-muted-foreground' },
  DROPPED: { label: 'Đã nghỉ', className: 'border-transparent bg-destructive/15 text-destructive' },
  COMPLETED: { label: 'Hoàn thành', className: 'border-transparent bg-primary/15 text-primary' },
};
