import { describe, it, expect } from 'vitest';
import { ALL_ROLES, can, ERROR_HTTP_STATUS, ErrorCode, PERMISSIONS, DomainEvent, type Permission, type Role } from '../index';

const M = 'MANAGER', A = 'ACADEMIC_STAFF', T = 'TEACHER', S = 'STUDENT', AD = 'ADMIN';

// Independent restatement of PRD section 3 (S cells count as allowed at role level).
const MATRIX: [Permission, Role[]][] = [
  ['leads.create', [M, A]],
  ['students.create', [M, A]],
  ['enrollments.updateCourse', [M, A, S]],
  ['courses.manage', [M, A]],
  ['rooms.manage', [M, A]],
  ['placement.schedule', [M, A]],
  ['placement.grade', [T]],
  ['classes.manage', [M, A]],
  ['enrollments.assign', [M, A]],
  ['enrollments.confirm', [S]],
  ['students.search', [M, T, A]],
  ['students.viewProfile', [M, T, S, A]],
  ['students.update', [M, A]],
  ['sessions.manage', [M, A]],
  ['sessions.view', [M, T, S, A]],
  ['attendance.take', [T, A]],
  ['attendance.viewHistory', [M, T, S, A]],
  ['grades.enter', [T]],
  ['grades.view', [M, T, S, A]],
  ['fees.update', [M, A]],
  ['discounts.decide', [M]],
  ['fees.view', [M, T, S, A]],
  ['reports.view', [M, A]],
  ['users.manage', [AD, M]],
  ['settings.update', [M]],
];

describe('permissions', () => {
  it.each(MATRIX)('%s', (p, allowed) => {
    for (const r of ALL_ROLES) expect(can({ role: r }, p)).toBe(allowed.includes(r));
  });
  it('can(null, x) === false', () => {
    expect(can(null, 'leads.create')).toBe(false);
  });
  it('MATRIX phủ mọi Permission', () => {
    expect(new Set(MATRIX.map((m) => m[0]))).toEqual(new Set(Object.keys(PERMISSIONS)));
  });
  it('ADMIN chỉ có users.manage', () => {
    const own = MATRIX.filter(([, rs]) => rs.includes(AD)).map(([p]) => p);
    expect(own).toEqual(['users.manage']);
  });
});

describe('errors', () => {
  it('mỗi ErrorCode có HTTP status', () => {
    Object.values(ErrorCode).forEach((c) => expect(ERROR_HTTP_STATUS[c]).toBeGreaterThanOrEqual(400));
  });
  it('status đặc biệt', () => {
    expect(ERROR_HTTP_STATUS.ACCOUNT_LOCKED).toBe(423);
    expect(ERROR_HTTP_STATUS.CONFLICT).toBe(409);
    expect(ERROR_HTTP_STATUS.INTERNAL).toBe(500);
    expect(ERROR_HTTP_STATUS.CLASS_FULL).toBe(422);
    expect(ERROR_HTTP_STATUS.ATTENDANCE_ALREADY_TAKEN).toBe(409);
  });
});

describe('events', () => {
  it('có 7 domain event', () => {
    expect(Object.values(DomainEvent)).toHaveLength(7);
    expect(DomainEvent.ClassFinished).toBe('class.finished');
  });
});
