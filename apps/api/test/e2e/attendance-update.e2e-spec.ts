import { Types } from 'mongoose';
import { AttendanceStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { makeClass, makeEnrollment, makeSession } from '../factories/academic.factory';
import { makeStudent } from '../factories/student.factory';
import { loginAs, signTestToken } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const START = new Date('2026-01-06T02:00:00Z');
const END = new Date('2026-01-06T04:00:00Z');
const DAY = 24 * 3_600_000;
const MIN = 60_000;

describe('FR-ATT-03 Cập nhật điểm danh', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.clock.set(START));
  afterAll(async () => {
    await t.close();
  });

  const auth = (req: import('supertest').Test, token: string) => req.set('Authorization', `Bearer ${token}`);
  const put = (id: string, token: string, body: object) => auth(t.http().put(`/api/v1/sessions/${id}/attendance`), token).send(body);
  const patch = (id: string, token: string, body: object) => auth(t.http().patch(`/api/v1/sessions/${id}/attendance`), token).send(body);
  const get = (id: string, token: string) => auth(t.http().get(`/api/v1/sessions/${id}/attendance`), token);
  const tokenFor = async (role: Role) =>
    (await loginAs(t, role, role === Role.STUDENT ? { studentId: new Types.ObjectId() } : {})).token;

  async function seed(taken = true) {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id });
    const session = await makeSession(t.conn, { classId: cls._id, teacherId: teacher.user._id, startAt: START, endAt: END });
    const students: Awaited<ReturnType<typeof makeStudent>>[] = [];
    for (let i = 0; i < 2; i++) {
      const st = await makeStudent(t.conn);
      await makeEnrollment(t.conn, {
        studentId: st._id,
        courseId: cls.courseId,
        classId: cls._id,
        status: EnrollmentStatus.ENROLLED,
        history: [{ from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: new Date('2026-01-01T00:00:00Z') }],
      });
      students.push(st);
    }
    const id = String(session._id);
    if (taken) {
      const r = await put(id, teacher.token, {
        records: students.map((s) => ({ studentId: String(s._id), status: AttendanceStatus.PRESENT })),
      });
      expect(r.status).toBe(200);
    }
    const tt = () => signTestToken(t, { sub: String(teacher.user._id), role: Role.TEACHER });
    return { teacher, tt, id, students, sid: (i: number) => String(students[i]!._id) };
  }

  it('FR-ATT-03 PATCH đổi PRESENT→LATE → history[0] {from,to,by,at,reason}', async () => {
    const s = await seed();
    t.clock.set(new Date(START.getTime() + 3 * 3_600_000));
    const res = await patch(s.id, s.tt(), { records: [{ studentId: s.sid(0), status: AttendanceStatus.LATE, reason: 'đến trễ' }] });
    expect(res.status).toBe(200);
    const row = res.body.data.roster.find((r: { studentId: string }) => r.studentId === s.sid(0));
    expect(row.status).toBe(AttendanceStatus.LATE);
    expect(row.history).toEqual([
      { from: AttendanceStatus.PRESENT, to: AttendanceStatus.LATE, by: String(s.teacher.user._id), at: t.clock.now().toISOString(), reason: 'đến trễ' },
    ]);
    expect(res.body.data.takenByName).toBe(s.teacher.user.fullName);
  });

  it('FR-ATT-03 trạng thái không đổi → history không thêm', async () => {
    const s = await seed();
    const res = await patch(s.id, s.teacher.token, { records: [{ studentId: s.sid(0), status: AttendanceStatus.PRESENT }] });
    expect(res.status).toBe(200);
    expect(res.body.data.roster.every((r: { history: unknown[] }) => r.history.length === 0)).toBe(true);
  });

  it('FR-ATT-03 GV khi now = endAt + 7d − 1 phút → 200', async () => {
    const s = await seed();
    t.clock.set(new Date(END.getTime() + 7 * DAY - MIN));
    const res = await patch(s.id, s.tt(), { records: [{ studentId: s.sid(0), status: AttendanceStatus.EXCUSED }] });
    expect(res.status).toBe(200);
  });

  it('FR-ATT-03 GV khi now = endAt + 7d + 1 phút → 422 ATTENDANCE_EDIT_WINDOW_CLOSED', async () => {
    const s = await seed();
    t.clock.set(new Date(END.getTime() + 7 * DAY + MIN));
    const res = await patch(s.id, s.tt(), { records: [{ studentId: s.sid(0), status: AttendanceStatus.EXCUSED }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.ATTENDANCE_EDIT_WINDOW_CLOSED);
  });

  it('FR-ATT-03 ACADEMIC_STAFF sau 30 ngày → 200', async () => {
    const s = await seed();
    t.clock.set(new Date(END.getTime() + 30 * DAY));
    const res = await patch(s.id, await tokenFor(Role.ACADEMIC_STAFF), { records: [{ studentId: s.sid(0), status: AttendanceStatus.UNEXCUSED }] });
    expect(res.status).toBe(200);
    expect(res.body.data.roster.find((r: { studentId: string }) => r.studentId === s.sid(0)).history).toHaveLength(1);
  });

  it('FR-ATT-03 teacherAttendanceEditDays = 3 (PATCH /settings) → GV sau 4 ngày 422', async () => {
    const s = await seed();
    const st = await patchSettings(3);
    expect(st).toBe(200);
    try {
      t.clock.set(new Date(END.getTime() + 4 * DAY));
      const res = await patch(s.id, s.tt(), { records: [{ studentId: s.sid(0), status: AttendanceStatus.LATE }] });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.ATTENDANCE_EDIT_WINDOW_CLOSED);
    } finally {
      await patchSettings(7);
    }
  });

  async function patchSettings(days: number) {
    const tok = await tokenFor(Role.MANAGER);
    return (await auth(t.http().patch('/api/v1/settings'), tok).send({ teacherAttendanceEditDays: days })).status;
  }

  it('FR-ATT-03 chưa điểm danh → 422 INVALID_STATUS_TRANSITION', async () => {
    const s = await seed(false);
    const res = await patch(s.id, s.teacher.token, { records: [{ studentId: s.sid(0), status: AttendanceStatus.LATE }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
  });

  it('FR-ATT-03 studentId lạ → 400 STUDENT_NOT_IN_ROSTER', async () => {
    const s = await seed();
    const res = await patch(s.id, s.teacher.token, { records: [{ studentId: String(new Types.ObjectId()), status: AttendanceStatus.LATE }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.STUDENT_NOT_IN_ROSTER);
  });

  it('FR-ATT-03 studentId trùng → 400 VALIDATION_FAILED DUPLICATE_STUDENT', async () => {
    const s = await seed();
    const rec = { studentId: s.sid(0), status: AttendanceStatus.LATE };
    const res = await patch(s.id, s.teacher.token, { records: [rec, rec] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.details.fields.records).toBe('DUPLICATE_STUDENT');
  });

  it('FR-ATT-03 HV thuộc roster chưa có bản ghi → tạo mới với history from null', async () => {
    const s = await seed();
    const st = await makeStudent(t.conn);
    const cls = await t.conn.model('Session').findById(s.id).lean<{ classId: Types.ObjectId }>();
    await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: new Types.ObjectId(),
      classId: cls!.classId,
      status: EnrollmentStatus.ENROLLED,
      history: [{ from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: new Date('2026-01-02T00:00:00Z') }],
    });
    const res = await patch(s.id, s.teacher.token, { records: [{ studentId: String(st._id), status: AttendanceStatus.LATE }] });
    expect(res.status).toBe(200);
    const row = res.body.data.roster.find((r: { studentId: string }) => r.studentId === String(st._id));
    expect(row.status).toBe(AttendanceStatus.LATE);
    expect(row.history).toHaveLength(1);
    expect(row.history[0]).toMatchObject({ from: null, to: AttendanceStatus.LATE });
  });

  it('FR-ATT-03 audit_logs có entity attendance', async () => {
    const s = await seed();
    await patch(s.id, s.teacher.token, { records: [{ studentId: s.sid(0), status: AttendanceStatus.LATE }] });
    const logs = await t.conn
      .model('AuditLog')
      .find({ entity: 'attendance' })
      .lean<{ before: { status: string }; after: { status: string } }[]>();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l) => l.before?.status === AttendanceStatus.PRESENT && l.after?.status === AttendanceStatus.LATE)).toBe(true);
  });

  it('FR-ATT-03 GET roster → editable false cho GV quá cửa sổ, true cho S', async () => {
    const s = await seed();
    t.clock.set(new Date(END.getTime() + 8 * DAY));
    expect((await get(s.id, s.tt())).body.data.editable).toBe(false);
    expect((await get(s.id, await tokenFor(Role.ACADEMIC_STAFF))).body.data.editable).toBe(true);
  });

  it('FR-ATT-03 GV khác → 404', async () => {
    const s = await seed();
    const other = await tokenFor(Role.TEACHER);
    expect((await patch(s.id, other, { records: [{ studentId: s.sid(0), status: AttendanceStatus.LATE }] })).status).toBe(404);
  });

  it.each([Role.MANAGER, Role.STUDENT, Role.ADMIN])('FR-ATT-03 %s không được PATCH → 403', async (role) => {
    const s = await seed();
    const res = await patch(s.id, await tokenFor(role), { records: [{ studentId: s.sid(0), status: AttendanceStatus.LATE }] });
    expect(res.status).toBe(403);
  });
});
