import { describe, expect, it } from 'vitest';
import * as S from '../index';

const id = (n: number) => n.toString(16).padStart(24, '0');
const ts = '2026-01-05T11:00:00.000Z';

describe('common', () => {
  it('zVnPhone chuẩn hóa', () => {
    expect(S.zVnPhone.parse('+84912345678')).toBe('0912345678');
    expect(S.zVnPhone.parse('0912 345 678')).toBe('0912345678');
    expect(S.zVnPhone.safeParse('12345').success).toBe(false);
  });
  it('zMoney / zScoreShape', () => {
    expect(S.zMoney.safeParse(1.5).success).toBe(false);
    expect(S.zMoney.safeParse(-1).success).toBe(false);
    expect(S.zMoney.safeParse(0).success).toBe(true);
    expect(S.zScoreShape.safeParse(10.25).success).toBe(true);
    expect(S.zScoreShape.safeParse(null).success).toBe(true);
    expect(S.zScoreShape.safeParse('x').success).toBe(false);
  });
  it('zObjectId / zDateOnly / zTimeHHmm', () => {
    expect(S.zObjectId.safeParse(id(1)).success).toBe(true);
    expect(S.zObjectId.safeParse('abc').success).toBe(false);
    expect(S.zDateOnly.safeParse('2026-02-30').success).toBe(false);
    expect(S.zDateOnly.safeParse('2026-02-28').success).toBe(true);
    expect(S.zTimeHHmm.safeParse('18:00').success).toBe(true);
    expect(S.zTimeHHmm.safeParse('24:00').success).toBe(false);
  });
  it('zPagination', () => {
    expect(S.zPagination.parse({})).toEqual({ page: 1, limit: 20 });
    expect(S.zPagination.parse({ page: '2', limit: '50', sort: '-createdAt' })).toEqual({
      page: 2,
      limit: 50,
      sort: '-createdAt',
    });
    expect(S.zPagination.safeParse({ limit: 101 }).success).toBe(false);
    expect(S.zPagination.safeParse({ page: 0 }).success).toBe(false);
  });
  it('zBoolQuery và paginated()', () => {
    expect(S.zBoolQuery.parse('false')).toBe(false);
    expect(S.zBoolQuery.parse('true')).toBe(true);
    expect(S.zBoolQuery.safeParse('maybe').success).toBe(false);
    expect(S.envelope(S.zObjectId).safeParse({ data: id(1) }).success).toBe(true);
    const P = S.paginated(S.zObjectId);
    expect(P.safeParse({ data: [id(1)], meta: { page: 1, limit: 20, total: 1 } }).success).toBe(true);
  });
});

const meDto = { id: id(1), username: 'a@b.vn', fullName: 'A', role: 'MANAGER', mustChangePassword: false };

describe('smoke: mỗi file schema', () => {
  it('auth', () => {
    expect(S.LoginInput.safeParse({ username: 'u', password: 'p' }).success).toBe(true);
    expect(S.AuthResultDto.safeParse({ accessToken: 't', user: meDto }).success).toBe(true);
    expect(S.ChangePasswordInput.safeParse({ currentPassword: 'a', newPassword: 'Password1' }).success).toBe(true);
    expect(S.ChangePasswordInput.safeParse({ currentPassword: 'a', newPassword: 'short' }).success).toBe(false);
  });
  it('users', () => {
    expect(
      S.CreateUserInput.safeParse({ email: 'T@x.vn', fullName: 'Teacher', role: 'TEACHER', teacherProfile: { languages: ['en'], levels: [] } }).success,
    ).toBe(true);
    expect(S.UpdateUserInput.safeParse({ role: 'ADMIN', x: 1 }).success).toBe(false); // strict
    expect(S.ListUsersQuery.parse({ role: 'TEACHER' })).toMatchObject({ page: 1, limit: 20 });
    expect(S.ResetPasswordResultDto.safeParse({ tempPassword: 'x' }).success).toBe(true);
    expect(S.TeacherOptionDto.safeParse({ id: id(1), fullName: 'T' }).success).toBe(true);
  });
  it('courses', () => {
    const c = { code: 'eng-ielts', name: 'IELTS', language: 'EN', levels: ['4.0'], totalSessions: 24, baseFee: 1000000 };
    expect(S.CreateCourseInput.parse(c).code).toBe('ENG-IELTS');
    expect(S.CreateCourseInput.safeParse({ ...c, levels: [] }).success).toBe(false);
    expect(S.UpdateCourseInput.safeParse({ code: 'X' }).success).toBe(false); // strict, code immutable
    expect(S.ListCoursesQuery.safeParse({}).success).toBe(true);
  });
  it('rooms', () => {
    expect(S.CreateRoomInput.safeParse({ code: 'R1', name: 'Phòng 1', capacity: 20 }).success).toBe(true);
    expect(S.UpdateRoomInput.safeParse({ status: 'INACTIVE' }).success).toBe(true);
    expect(S.ListRoomsQuery.safeParse({}).success).toBe(true);
  });
  it('settings', () => {
    expect(S.UpdateSettingsInput.safeParse({ gradeLockDays: 10 }).success).toBe(true);
    expect(S.UpdateSettingsInput.safeParse({ foo: 1 }).success).toBe(false);
  });
  it('settings: giới hạn giá trị', () => {
    const ok = (v: object) => S.UpdateSettingsInput.safeParse(v).success;
    expect(ok({ attendanceWarningThreshold: 0 })).toBe(true);
    expect(ok({ attendanceWarningThreshold: 1 })).toBe(true);
    expect(ok({ attendanceWarningThreshold: 0.2 })).toBe(true);
    expect(ok({ attendanceWarningThreshold: -0.1 })).toBe(false);
    expect(ok({ attendanceWarningThreshold: 1.5 })).toBe(false);
    for (const k of ['gradeLockDays', 'teacherAttendanceEditDays', 'invoiceDueDaysAfterStart']) {
      expect([k, ok({ [k]: 0 })]).toEqual([k, true]);
      expect([k, ok({ [k]: 365 })]).toEqual([k, true]);
      expect([k, ok({ [k]: -1 })]).toEqual([k, false]);
      expect([k, ok({ [k]: 366 })]).toEqual([k, false]);
      expect([k, ok({ [k]: 1.5 })]).toEqual([k, false]);
    }
  });
  it('leads', () => {
    const e = S.CreateLeadInput.safeParse({}).error!.flatten().fieldErrors;
    expect(e).toHaveProperty('phone');
    const l = { fullName: 'Nguyễn A', dob: '2010-01-01', gender: 'MALE', phone: '0912345678', interestedCourseId: id(2) };
    expect(S.CreateLeadInput.safeParse(l).success).toBe(true);
    expect(S.CreateLeadQuery.parse({ force: 'true' })).toEqual({ force: true });
    expect(S.ConvertLeadQuery.parse({})).toEqual({ force: false });
    expect(S.UpdateLeadInput.safeParse({ note: 'x' }).success).toBe(true);
    expect(S.ListLeadsQuery.safeParse({ status: 'NEW', from: '2026-01-01' }).success).toBe(true);
    expect(S.CancelLeadInput.safeParse({ reason: 'x' }).success).toBe(true);
    expect(S.ConvertLeadResultDto.safeParse({ student: { ...studentDto }, tempPassword: 'x' }).success).toBe(true);
  });
  it('students', () => {
    expect(S.UpdateStudentContactInput.safeParse({ phone: '0912345678', email: 'a@b.vn' }).success).toBe(true);
    expect(S.UpdateStudentContactInput.safeParse({ fullName: 'x' }).success).toBe(false);
    expect(S.UpdateStudentInput.safeParse({ status: 'DROPPED' }).success).toBe(true);
    expect(S.ListStudentsQuery.parse({ q: 'an', limit: '10' })).toMatchObject({ q: 'an', limit: 10 });
    expect(S.StudentDto.safeParse(studentDto).success).toBe(true);
    expect(
      S.StudentDetailDto.safeParse({ ...studentDto, enrollments: [], summary: { attendanceRate: 1, averageScore: null, outstandingBalance: 0 } }).success,
    ).toBe(true);
    expect(S.StudentDocumentDto.safeParse({ id: id(1), fileName: 'a.pdf', mimeType: 'application/pdf', size: 10, uploadedAt: ts, uploadedBy: id(2) }).success).toBe(true);
    expect(S.AuditLogDto.safeParse({ id: id(1), actorId: id(2), actorRole: 'MANAGER', action: 'update', entity: 'student', entityId: id(3), before: null, after: {}, at: ts }).success).toBe(true);
  });
  it('enrollments', () => {
    expect(S.CreateEnrollmentInput.safeParse({ courseId: id(1) }).success).toBe(true);
    expect(S.AssignClassInput.safeParse({ classId: id(1), overrideReason: 'abc' }).success).toBe(false);
    expect(S.AssignClassInput.safeParse({ classId: id(1) }).success).toBe(true);
    expect(S.ChangeEnrollmentCourseInput.safeParse({ courseId: id(1) }).success).toBe(true);
    expect(S.SkipPlacementInput.safeParse({ level: 'A1', reason: 'Có chứng chỉ' }).success).toBe(true);
    expect(S.TransferEnrollmentInput.safeParse({ toClassId: id(1), reason: 'x' }).success).toBe(true);
    expect(S.WithdrawEnrollmentInput.safeParse({ status: 'RESERVED', reason: 'x' }).success).toBe(true);
    expect(S.WithdrawEnrollmentInput.safeParse({ status: 'ENROLLED', reason: 'x' }).success).toBe(false);
    expect(S.ListEnrollmentsQuery.safeParse({ status: 'ENROLLED' }).success).toBe(true);
    expect(S.ListWaitingEnrollmentsQuery.safeParse({}).success).toBe(true);
    expect(S.EnrollmentDto.safeParse(enrollmentDto).success).toBe(true);
    expect(S.WaitingEnrollmentDto.safeParse({ ...enrollmentDto, waitingDays: 3 }).success).toBe(true);
  });
  it('placement', () => {
    const p = { courseId: id(1), startAt: ts, endAt: '2026-01-05T12:00:00.000Z', roomId: id(2), teacherId: id(3) };
    expect(S.CreatePlacementTestInput.safeParse(p).success).toBe(true);
    expect(S.UpdatePlacementTestInput.safeParse({ status: 'CANCELLED' }).success).toBe(true);
    expect(S.AddCandidatesInput.safeParse({ enrollmentIds: [id(1)] }).success).toBe(true);
    expect(S.AddCandidatesInput.safeParse({ enrollmentIds: [] }).success).toBe(false);
    expect(S.PutPlacementResultsInput.safeParse([{ enrollmentId: id(1), score: 7.25, level: 'B1', comment: '' }]).success).toBe(true);
    expect(S.ListPlacementTestsQuery.safeParse({ from: ts }).success).toBe(true);
    expect(S.PlacementTestDto.safeParse({ ...p, id: id(9), status: 'SCHEDULED', candidates: [], createdAt: ts, updatedAt: ts }).success).toBe(true);
  });
  it('classes', () => {
    const c = { code: 'a1-01', name: 'A1', courseId: id(1), level: 'A1', teacherId: id(2), maxCapacity: 20, startDate: '2026-01-05', endDate: '2026-03-05' };
    expect(S.CreateClassInput.parse(c).code).toBe('A1-01');
    expect(S.UpdateClassInput.safeParse({ currentSize: 3 }).success).toBe(false);
    expect(S.UpdateClassInput.safeParse({ maxCapacity: 30 }).success).toBe(true);
    expect(S.ListClassesQuery.parse({ hasSeat: 'true' })).toMatchObject({ hasSeat: true });
    expect(S.ClassRosterQuery.safeParse({}).success).toBe(true);
    expect(S.ClassDto.safeParse({ ...c, id: id(5), currentSize: 0, status: 'PLANNED', createdAt: ts, updatedAt: ts }).success).toBe(true);
    expect(S.ClassStudentDto.safeParse({ studentId: id(1), enrollmentId: id(2), studentCode: 'HV1', fullName: 'A', absenceRate: 0.1, warning: false }).success).toBe(true);
  });
  it('sessions', () => {
    const b = { classId: id(1), roomId: id(2), teacherId: id(3), weekdays: [1, 3], startTime: '18:00', endTime: '19:30', fromDate: '2026-01-05', toDate: '2026-02-05' };
    expect(S.BulkCreateSessionsInput.safeParse(b).success).toBe(true);
    expect(S.BulkCreateSessionsInput.safeParse({ ...b, weekdays: [0] }).success).toBe(false);
    expect(S.BulkCreateSessionsInput.safeParse({ ...b, weekdays: [8] }).success).toBe(false);
    expect(S.BulkCreateSessionsInput.safeParse({ ...b, weekdays: [] }).success).toBe(false);
    const s = { classId: id(1), roomId: id(2), teacherId: id(3), startAt: ts, endAt: '2026-01-05T12:00:00.000Z' };
    expect(S.CreateSessionInput.safeParse(s).success).toBe(true);
    expect(S.CheckConflictsInput.safeParse(s).success).toBe(true);
    expect(S.UpdateSessionInput.safeParse({ roomId: id(2) }).success).toBe(true);
    expect(S.CancelSessionInput.safeParse({ reason: 'GV ốm' }).success).toBe(true);
    expect(S.CancelFutureSessionsInput.safeParse({ reason: 'x' }).success).toBe(true);
    expect(S.ListSessionsQuery.safeParse({ from: '2026-01-01', to: '2026-02-01' }).success).toBe(true);
    expect(S.ListSessionsQuery.safeParse({ from: '2026-01-01' }).success).toBe(false);
    expect(S.SessionDto.safeParse({ ...s, id: id(7), status: 'SCHEDULED', cancelReason: null, seriesId: null, attendanceTakenAt: null, attendanceNote: '', createdAt: ts, updatedAt: ts }).success).toBe(true);
    expect(S.SessionConflictDto.safeParse({ sessionId: id(1), kind: 'ROOM', startAt: ts, endAt: ts, roomId: id(2), teacherId: id(3) }).success).toBe(true);
    expect(S.BulkCreateSessionsResultDto.safeParse({ seriesId: id(1), sessions: [] }).success).toBe(true);
    expect(S.CheckConflictsResultDto.safeParse({ conflicts: [] }).success).toBe(true);
  });
  it('attendance', () => {
    expect(S.TakeAttendanceInput.safeParse({ records: [{ studentId: id(1), status: 'PRESENT' }], sessionNote: 'ok' }).success).toBe(true);
    expect(S.TakeAttendanceInput.safeParse({ records: [{ studentId: id(1), status: 'MAYBE' }] }).success).toBe(false);
    expect(S.UpdateAttendanceInput.safeParse({ records: [{ studentId: id(1), status: 'LATE', reason: 'x' }] }).success).toBe(true);
    expect(S.ListAttendanceQuery.safeParse({ from: '2026-01-01' }).success).toBe(true);
    expect(S.AttendanceSummaryQuery.parse({ groupBy: 'class' })).toMatchObject({ groupBy: 'class' });
    expect(S.AttendanceSummaryQuery.safeParse({}).success).toBe(false);
    expect(S.SessionAttendanceDto.safeParse({ sessionId: id(1), taken: false, sessionNote: '', roster: [{ studentId: id(2), enrollmentId: id(3), studentCode: 'HV1', fullName: 'A', status: null, note: '' }] }).success).toBe(true);
    expect(S.AttendanceDto.safeParse({ id: id(1), sessionId: id(2), classId: id(3), studentId: id(4), enrollmentId: id(5), status: 'PRESENT', note: '', recordedBy: id(6), history: [], createdAt: ts, updatedAt: ts }).success).toBe(true);
    expect(S.AttendanceSummaryRowDto.safeParse({ key: id(1), label: 'A', PRESENT: 1, LATE: 0, EXCUSED: 0, UNEXCUSED: 0, total: 1, attendanceRate: 1, absenceRate: 0 }).success).toBe(true);
  });
  it('grades', () => {
    expect(S.CreateAssessmentInput.safeParse({ name: 'Q1', type: 'QUIZ', weight: 10, heldOn: '2026-01-05' }).success).toBe(true);
    expect(S.UpdateAssessmentInput.safeParse({ classId: id(1) }).success).toBe(false);
    expect(S.UpsertGradesInput.safeParse({ grades: [{ studentId: id(1), score: 7.3, comment: '' }, { studentId: id(2), score: null }], confirm: false }).success).toBe(true);
    expect(S.UpsertGradesInput.safeParse({ grades: [] }).success).toBe(false);
    expect(S.AmendGradeInput.safeParse({ score: 8, comment: '', reason: 'nhầm' }).success).toBe(true);
    expect(S.UnlockAssessmentInput.safeParse({ until: ts }).success).toBe(true);
    expect(S.ListResultsQuery.safeParse({ classId: id(1) }).success).toBe(true);
    expect(S.TranscriptQuery.safeParse({ studentId: id(1), classId: id(2) }).success).toBe(true);
    const a = { id: id(1), classId: id(2), name: 'Q', type: 'QUIZ', weight: 10, heldOn: '2026-01-05', confirmedAt: null, unlockedUntil: null, lockedAt: ts, isLocked: false, createdAt: ts, updatedAt: ts };
    expect(S.AssessmentDto.safeParse(a).success).toBe(true);
    expect(S.GradeDto.safeParse({ id: id(1), assessmentId: id(2), classId: id(3), studentId: id(4), enrollmentId: id(5), score: null, comment: '', isDraft: true, history: [], createdAt: ts, updatedAt: ts }).success).toBe(true);
    expect(S.ResultDto.safeParse({ studentId: id(1), classId: id(2), courseId: id(3), items: [{ assessmentId: id(4), name: 'Q', type: 'QUIZ', weight: 10, score: 8 }], average: 8, gradeClass: 'GOOD', passed: true }).success).toBe(true);
  });
  it('invoices', () => {
    expect(S.CreateInvoiceInput.safeParse({ studentId: id(1), description: 'Giáo trình', amountDue: 100000, dueDate: '2026-02-01' }).success).toBe(true);
    expect(S.CreateInvoiceInput.safeParse({ studentId: id(1), description: 'x', amountDue: 1.5, dueDate: '2026-02-01' }).success).toBe(false);
    expect(S.ApplyDiscountInput.safeParse({ kind: 'PERCENT', value: 10, reason: 'Anh em' }).success).toBe(true);
    expect(S.DecideDiscountInput.safeParse({ approve: true }).success).toBe(true);
    expect(S.RecordPaymentInput.safeParse({ amount: 500000, method: 'CASH', paidAt: ts }).success).toBe(true);
    expect(S.RecordPaymentInput.safeParse({ amount: 0, method: 'CASH' }).success).toBe(false);
    expect(S.VoidPaymentInput.safeParse({ reason: 'x' }).success).toBe(true);
    expect(S.VoidInvoiceInput.safeParse({ reason: 'x' }).success).toBe(true);
    expect(S.ListInvoicesQuery.parse({ overdue: 'true' })).toMatchObject({ overdue: true });
    expect(S.PaymentDto.safeParse(paymentDto).success).toBe(true);
    expect(S.InvoiceDto.safeParse(invoiceDto).success).toBe(true);
    expect(S.InvoiceDetailDto.safeParse({ ...invoiceDto, payments: [paymentDto] }).success).toBe(true);
  });
  it('reports', () => {
    expect(S.AdmissionsReportQuery.safeParse({ from: '2026-01-01', to: '2026-01-31' }).success).toBe(true);
    expect(S.AttendanceReportQuery.safeParse({ from: '2026-01-01', to: '2026-01-31' }).success).toBe(true);
    expect(S.AcademicReportQuery.safeParse({ from: '2026-01-01', to: '2026-01-31', teacherId: id(1) }).success).toBe(true);
    expect(S.FinanceReportQuery.parse({ from: '2026-01-01', to: '2026-01-31' }).groupBy).toBe('month');
    expect(S.FinanceReportQuery.safeParse({ from: '2026-01-01', to: '2026-01-31', groupBy: 'x' }).success).toBe(false);
    expect(S.ExportReportQuery.safeParse({ format: 'xlsx', from: '2026-01-01', to: '2026-01-31' }).success).toBe(true);
    expect(S.ReportTypeParam.safeParse('finance').success).toBe(true);
    expect(S.DashboardDto.safeParse({ activeStudents: 1, ongoingClasses: 1, sessionsToday: 1, overdueInvoices: 0, waitingEnrollments: 0 }).success).toBe(true);
    expect(S.AdmissionsReportDto.safeParse({ totals: { leads: 1, newProfiles: 1, conversionRate: 1, enrolled: 1, waiting: 0 }, rows: [] }).success).toBe(true);
    expect(S.AttendanceReportDto.safeParse({ byClass: [], byStudent: [], overThreshold: [] }).success).toBe(true);
    expect(S.AcademicReportDto.safeParse({ rows: [], distribution: { EXCELLENT: 0, GOOD: 0, FAIR: 0, AVERAGE: 0, FAIL: 0 }, passRate: 0, failRate: 0 }).success).toBe(true);
    expect(S.FinanceReportDto.safeParse({ totals: { revenue: 0, totalDue: 0, outstanding: 0, overdue: 0, totalDiscount: 0 }, rows: [] }).success).toBe(true);
  });
  it('notifications', () => {
    expect(S.ListNotificationsQuery.parse({ unread: 'true' })).toMatchObject({ unread: true });
    const n = { id: id(1), type: 'CLASS_ASSIGNED', title: 't', body: 'b', refId: id(2), readAt: null, createdAt: ts };
    expect(S.NotificationDto.safeParse({ ...n, refType: 'CLASS' }).success).toBe(true);
    expect(S.NotificationDto.safeParse({ ...n, refType: 'class' }).success).toBe(false);
    expect(S.NotificationDto.safeParse({ ...n, refType: null, refId: null }).success).toBe(true);
    for (const refType of ['CLASS', 'SESSION', 'STUDENT', 'INVOICE', 'ASSESSMENT', 'ENROLLMENT', 'PLACEMENT_TEST', 'PAYMENT']) {
      expect([refType, S.NotificationDto.safeParse({ ...n, refType }).success]).toEqual([refType, true]);
    }
    expect(S.ALL_NOTIFICATION_REF_TYPES).toHaveLength(8);
    expect(S.UnreadCountDto.safeParse({ count: 3 }).success).toBe(true);
  });
});

const studentDto = {
  id: id(1), code: 'HV202600001', fullName: 'A', dob: '2010-01-01', gender: 'MALE', phone: '0912345678', email: null, address: '',
  status: 'ACTIVE', leadId: null, userId: null, documents: [], note: '', createdAt: ts, updatedAt: ts,
};
const enrollmentDto = {
  id: id(1), studentId: id(2), courseId: id(3), classId: null, status: 'PENDING_PLACEMENT', placementLevel: null, placementSkipped: null,
  levelOverride: null, waitingSince: null, enrolledAt: null, confirmedAt: null, transferredToId: null, transferredFromId: null,
  invoiceId: null, history: [], createdAt: ts, updatedAt: ts,
};
const invoiceDto = {
  id: id(1), code: 'HD2026010001', kind: 'TUITION', studentId: id(2), enrollmentId: id(3), courseId: id(4), description: '', classId: null,
  amountDue: 1000, discount: null, finalAmount: 1000, amountPaid: 0, balance: 1000, dueDate: '2026-02-01', status: 'UNPAID', createdAt: ts, updatedAt: ts,
};
const paymentDto = {
  id: id(1), code: 'PT2026010001', invoiceId: id(2), studentId: id(3), amount: 100, method: 'CASH', paidAt: ts, note: '', status: 'VALID',
  voidReason: null, voidedBy: null, voidedAt: null, recordedBy: id(4), createdAt: ts, updatedAt: ts,
};
