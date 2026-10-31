import { describe, expect, it } from 'vitest';
import * as S from '../index';

const id = (n: number) => n.toString(16).padStart(24, '0');
const ts = '2026-01-05T11:00:00.000Z';

describe('hợp đồng Wave 2', () => {
  it('D12: FEES_OUTSTANDING trả 403', () => {
    expect(S.ERROR_HTTP_STATUS.FEES_OUTSTANDING).toBe(403);
  });

  it('R6/R12: ATTENDANCE_INCOMPLETE và DISCOUNT_INVALID trả 400 (FR-ATT-02, FR-FEE-03)', () => {
    expect(S.ERROR_HTTP_STATUS.ATTENDANCE_INCOMPLETE).toBe(400);
    expect(S.ERROR_HTTP_STATUS.DISCOUNT_INVALID).toBe(400);
  });

  it('FR-FEE-06: InvoiceTeacherViewDto loại bỏ payments/amountPaid/discount', () => {
    const full = {
      id: id(1), createdAt: ts, updatedAt: ts, code: 'HD20260001', kind: 'TUITION', studentId: id(2),
      enrollmentId: null, courseId: null, classId: id(3), amountDue: 1000, discount: null, finalAmount: 1000,
      amountPaid: 400, balance: 600, dueDate: '2026-01-10', status: 'PARTIAL', studentName: 'A',
      studentCode: 'HV1', overdue: false, payments: [],
    };
    const out = S.InvoiceTeacherViewDto.parse(full) as Record<string, unknown>;
    expect(out.balance).toBe(600);
    expect(out).not.toHaveProperty('payments');
    expect(out).not.toHaveProperty('amountPaid');
    expect(out).not.toHaveProperty('discount');
    expect(out).not.toHaveProperty('amountDue');
  });

  it('D14: AssessmentGradesDto có cờ left', () => {
    const assessment = {
      id: id(1), createdAt: ts, updatedAt: ts, classId: id(2), name: 'GK', type: 'MIDTERM', weight: 30,
      heldOn: '2026-01-05', confirmedAt: null, unlockedUntil: null, lockedAt: ts, isLocked: false,
    };
    const row = {
      studentId: id(3), enrollmentId: id(4), studentCode: 'HV1', studentName: 'A', score: 8, comment: null,
      isDraft: true, left: true, history: [],
    };
    expect(S.AssessmentGradesDto.safeParse({ assessment, rows: [row] }).success).toBe(true);
    expect(S.AssessmentGradesDto.safeParse({ assessment, rows: [{ ...row, left: undefined }] }).success).toBe(false);
  });

  it('SessionAttendanceDto có editable, takenAt, takenByName, roster[].history/absenceRate', () => {
    const base = {
      sessionId: id(1), taken: true, takenAt: ts, takenByName: 'GV', editable: true,
      roster: [{ studentId: id(2), enrollmentId: id(3), studentCode: 'HV1', fullName: 'A', status: 'PRESENT', history: [], absenceRate: 0.1 }],
    };
    expect(S.SessionAttendanceDto.safeParse(base).success).toBe(true);
    expect(S.SessionAttendanceDto.safeParse({ ...base, editable: undefined }).success).toBe(false);
    expect(S.SessionAttendanceDto.safeParse({ ...base, takenAt: null, takenByName: null }).success).toBe(true);
  });

  it('PlacementTestDto nhận courseName/roomCode/teacherName tùy chọn', () => {
    const dto = {
      id: id(1), createdAt: ts, updatedAt: ts, courseId: id(2), startAt: ts, endAt: ts, roomId: id(3),
      teacherId: id(4), status: 'SCHEDULED', candidates: [], courseName: 'IELTS', roomCode: 'P1', teacherName: 'GV',
    };
    const out = S.PlacementTestDto.parse(dto);
    expect(out.courseName).toBe('IELTS');
    expect(S.PlacementTestDto.safeParse({ ...dto, courseName: undefined }).success).toBe(true);
  });
});
