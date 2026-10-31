import { describe, expect, it } from 'vitest';
import * as S from '../index';

const id = (n: number) => n.toString(16).padStart(24, '0');
const ts = '2026-01-05T11:00:00.000Z';

const student = {
  id: id(1), code: 'HV202600001', fullName: 'A', dob: '2010-01-01', gender: 'MALE', phone: '0912345678', email: null, address: '',
  status: 'ACTIVE', leadId: null, userId: null, documents: [], note: '', createdAt: ts, updatedAt: ts,
};
const assessment = {
  id: id(1), createdAt: ts, updatedAt: ts, classId: id(2), name: 'GK', type: 'MIDTERM', weight: 30,
  heldOn: '2026-01-05', confirmedAt: null, unlockedUntil: null, lockedAt: ts, isLocked: false,
};

describe('hợp đồng Wave 3', () => {
  it('D24: StudentDto.currentClasses bắt buộc, mỗi phần tử { classId, code }', () => {
    expect(S.StudentDto.safeParse(student).success).toBe(false);
    expect(S.StudentDto.safeParse({ ...student, currentClasses: [] }).success).toBe(true);
    expect(S.StudentDto.safeParse({ ...student, currentClasses: [{ classId: id(2), code: 'L1' }] }).success).toBe(true);
    expect(S.StudentDto.safeParse({ ...student, currentClasses: [{ classId: id(2) }] }).success).toBe(false);
  });

  it('D24: StudentBriefDto.currentClasses bắt buộc', () => {
    const brief = { id: id(1), code: 'HV1', fullName: 'A', dob: '2010-01-01', phone: '0912345678', status: 'ACTIVE' };
    expect(S.StudentBriefDto.safeParse(brief).success).toBe(false);
    expect(S.StudentBriefDto.safeParse({ ...brief, currentClasses: [] }).success).toBe(true);
  });

  it('PendingAssessmentDto = AssessmentDto + classCode + className', () => {
    expect(S.PendingAssessmentDto.safeParse(assessment).success).toBe(false);
    expect(S.PendingAssessmentDto.safeParse({ ...assessment, classCode: 'L1', className: 'IELTS A1' }).success).toBe(true);
    expect(S.PendingAssessmentDto.safeParse({ ...assessment, classCode: 'L1' }).success).toBe(false);
  });

  it('D25: DashboardDto có todaySessions và admissionsTrend', () => {
    const base = { activeStudents: 1, ongoingClasses: 1, sessionsToday: 1, overdueInvoices: 0, waitingEnrollments: 0 };
    const session = {
      sessionId: id(1), startAt: ts, endAt: ts, classId: id(2), classCode: 'L1', roomCode: null, teacherName: null, attendanceTaken: false,
    };
    const full = { ...base, todaySessions: [session], admissionsTrend: [{ month: '2026-01', leads: 3, profiles: 1 }] };
    expect(S.DashboardDto.safeParse(base).success).toBe(false);
    expect(S.DashboardDto.safeParse(full).success).toBe(true);
    expect(S.DashboardDto.safeParse({ ...full, admissionsTrend: [{ month: '2026-1', leads: 3, profiles: 1 }] }).success).toBe(false);
  });
});
