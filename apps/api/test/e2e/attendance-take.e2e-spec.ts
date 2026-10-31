import { Types } from 'mongoose';
import { AttendanceStatus, EnrollmentStatus, ErrorCode, Role, SessionStatus } from '@lc/shared';
import { makeClass, makeEnrollment, makeSession } from '../factories/academic.factory';
import { makeStudent } from '../factories/student.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const START = new Date('2026-01-06T02:00:00Z');
const END = new Date('2026-01-06T04:00:00Z');

describe('FR-ATT-01/02 Điểm danh', () => {
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
  const get = (id: string, token: string) => auth(t.http().get(`/api/v1/sessions/${id}/attendance`), token);
  const tokenFor = async (role: Role) =>
    (await loginAs(t, role, role === Role.STUDENT ? { studentId: new Types.ObjectId() } : {})).token;

  const enrolledHistory = (at: string) => [{ from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: new Date(at) }];

  async function seed(n = 3, sessionOver: Record<string, unknown> = {}) {
    const teacher = await loginAs(t, Role.TEACHER);
    const assistant = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id, assistantTeacherId: assistant.user._id });
    const session = await makeSession(t.conn, { classId: cls._id, teacherId: teacher.user._id, startAt: START, endAt: END, ...sessionOver });
    const students: Array<{ st: Awaited<ReturnType<typeof makeStudent>>; en: Awaited<ReturnType<typeof makeEnrollment>> }> = [];
    for (let i = 0; i < n; i++) {
      const st = await makeStudent(t.conn);
      const en = await makeEnrollment(t.conn, {
        studentId: st._id,
        courseId: cls.courseId,
        classId: cls._id,
        status: EnrollmentStatus.ENROLLED,
        history: enrolledHistory('2026-01-01T00:00:00Z'),
      });
      students.push({ st, en });
    }
    const records = (statuses?: AttendanceStatus[]) => ({
      records: students.map((s, i) => ({
        studentId: String(s.st._id),
        status: statuses?.[i] ?? AttendanceStatus.PRESENT,
      })),
    });
    return { teacher, assistant, cls, session, id: String(session._id), students, records };
  }

  it('FR-ATT-01 GV lớp điểm danh đủ -> 200, attendanceTakenAt set, 4 trạng thái lưu đúng', async () => {
    const s = await seed(4);
    const sts = [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.EXCUSED, AttendanceStatus.UNEXCUSED];
    const res = await put(s.id, s.teacher.token, { ...s.records(sts), sessionNote: 'ghi chú' });
    expect(res.status).toBe(200);
    expect(res.body.data.taken).toBe(true);
    expect(res.body.data.takenAt).toBe(START.toISOString());
    expect(res.body.data.roster.map((r: { status: string }) => r.status).sort()).toEqual([...sts].sort());
    const doc = await t.conn.model('Session').findById(s.id).lean<{ attendanceTakenAt: Date; attendanceNote: string }>();
    expect(doc?.attendanceTakenAt).toEqual(START);
    expect(doc?.attendanceNote).toBe('ghi chú');
    const rows = await t.conn.model('Attendance').find({ sessionId: s.id }).lean<{ studentId: Types.ObjectId; status: string; recordedBy: Types.ObjectId }[]>();
    expect(rows).toHaveLength(4);
    s.students.forEach((x, i) => expect(rows.find((r) => String(r.studentId) === String(x.st._id))?.status).toBe(sts[i]));
    expect(String(rows[0]!.recordedBy)).toBe(String(s.teacher.user._id));
  });

  it('FR-ATT-01 GV dạy thay (session.teacherId) -> 200 và GV đó thấy buổi', async () => {
    const sub = await loginAs(t, Role.TEACHER);
    const s = await seed(2, { teacherId: sub.user._id });
    expect((await get(s.id, sub.token)).status).toBe(200);
    expect((await put(s.id, sub.token, s.records())).status).toBe(200);
  });

  it('FR-ATT-01 trợ giảng -> 200', async () => {
    const s = await seed(2);
    expect((await put(s.id, s.assistant.token, s.records())).status).toBe(200);
  });

  it('FR-ATT-01 ACADEMIC_STAFF -> 200', async () => {
    const s = await seed(2);
    expect((await put(s.id, await tokenFor(Role.ACADEMIC_STAFF), s.records())).status).toBe(200);
  });

  it('FR-ATT-01 GV khác -> 404 (PUT và GET)', async () => {
    const s = await seed(2);
    const other = (await loginAs(t, Role.TEACHER)).token;
    expect((await put(s.id, other, s.records())).status).toBe(404);
    expect((await get(s.id, other)).status).toBe(404);
  });

  it.each([Role.STUDENT, Role.MANAGER, Role.ADMIN])('FR-ATT-01 %s không được PUT -> 403', async (role) => {
    const s = await seed(2);
    expect((await put(s.id, await tokenFor(role), s.records())).status).toBe(403);
  });

  it.each([Role.STUDENT, Role.ADMIN])('FR-ATT-01 %s không được GET -> 403', async (role) => {
    const s = await seed(2);
    expect((await get(s.id, await tokenFor(role))).status).toBe(403);
  });

  it('FR-ATT-01 MANAGER GET -> 200 (chưa điểm danh: taken=false, status null)', async () => {
    const s = await seed(2);
    const res = await get(s.id, await tokenFor(Role.MANAGER));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ taken: false, takenAt: null, takenByName: null, editable: false });
    expect(res.body.data.roster).toHaveLength(2);
    expect(res.body.data.roster[0]).toMatchObject({ status: null, history: [], absenceRate: 0 });
  });

  it('FR-ATT-01 GET sau khi điểm danh: takenByName, editable, absenceRate theo lớp', async () => {
    const s = await seed(2);
    await put(s.id, s.teacher.token, s.records([AttendanceStatus.UNEXCUSED, AttendanceStatus.PRESENT]));
    const res = await get(s.id, s.teacher.token);
    expect(res.body.data.takenByName).toBe(s.teacher.user.fullName);
    expect(res.body.data.editable).toBe(true);
    const byId = new Map(res.body.data.roster.map((r: { studentId: string }) => [r.studentId, r]));
    expect(byId.get(String(s.students[0]!.st._id))).toMatchObject({ status: AttendanceStatus.UNEXCUSED, absenceRate: 1 });
    expect(byId.get(String(s.students[1]!.st._id))).toMatchObject({ absenceRate: 0 });
  });

  it('FR-ATT-01 thiếu 1 HV -> 400 ATTENDANCE_INCOMPLETE details.studentIds', async () => {
    const s = await seed(3);
    const body = s.records();
    const missing = body.records.pop()!;
    const res = await put(s.id, s.teacher.token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.ATTENDANCE_INCOMPLETE);
    expect(res.body.error.details.studentIds).toEqual([missing.studentId]);
  });

  it('FR-ATT-01 studentId lạ -> 400 STUDENT_NOT_IN_ROSTER details.studentIds', async () => {
    const s = await seed(2);
    const stranger = String(new Types.ObjectId());
    const body = s.records();
    body.records.push({ studentId: stranger, status: AttendanceStatus.PRESENT });
    const res = await put(s.id, s.teacher.token, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.STUDENT_NOT_IN_ROSTER);
    expect(res.body.error.details.studentIds).toEqual([stranger]);
  });

  it('FR-ATT-01 buổi CANCELLED -> 422 SESSION_CANCELLED', async () => {
    const s = await seed(2, { status: SessionStatus.CANCELLED, cancelReason: 'nghỉ' });
    const res = await put(s.id, s.teacher.token, s.records());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.SESSION_CANCELLED);
  });

  it('FR-ATT-02 startAt − 16 phút -> 422 ATTENDANCE_TOO_EARLY; −15 phút -> 200', async () => {
    const s = await seed(2);
    t.clock.set(new Date(START.getTime() - 16 * 60_000));
    const early = await put(s.id, s.teacher.token, s.records());
    expect(early.status).toBe(422);
    expect(early.body.error.code).toBe(ErrorCode.ATTENDANCE_TOO_EARLY);
    t.clock.set(new Date(START.getTime() - 15 * 60_000));
    expect((await put(s.id, s.teacher.token, s.records())).status).toBe(200);
  });

  it('FR-ATT-01 roster theo thời điểm: HV chuyển đi trước buổi không có; HV TRANSFERRED sau buổi vẫn có', async () => {
    const s = await seed(1);
    const mk = async (history: object[], status: EnrollmentStatus) => {
      const st = await makeStudent(t.conn);
      await makeEnrollment(t.conn, { studentId: st._id, courseId: s.cls.courseId, classId: s.cls._id, status, history: history as never });
      return String(st._id);
    };
    const before = await mk(
      [
        { from: null, to: EnrollmentStatus.ENROLLED, at: new Date('2026-01-01T00:00:00Z') },
        { from: EnrollmentStatus.ENROLLED, to: EnrollmentStatus.TRANSFERRED, at: new Date('2026-01-03T00:00:00Z') },
      ],
      EnrollmentStatus.TRANSFERRED,
    );
    const after = await mk(
      [
        { from: null, to: EnrollmentStatus.ENROLLED, at: new Date('2026-01-01T00:00:00Z') },
        { from: EnrollmentStatus.ENROLLED, to: EnrollmentStatus.TRANSFERRED, at: new Date('2026-01-10T00:00:00Z') },
      ],
      EnrollmentStatus.TRANSFERRED,
    );
    const res = await get(s.id, await tokenFor(Role.ACADEMIC_STAFF));
    const ids = res.body.data.roster.map((r: { studentId: string }) => r.studentId);
    expect(ids).not.toContain(before);
    expect(ids).toContain(after);
    expect(ids).toContain(String(s.students[0]!.st._id));
  });

  it('FR-ATT-01 PUT lần hai -> 409 ATTENDANCE_ALREADY_TAKEN', async () => {
    const s = await seed(2);
    expect((await put(s.id, s.teacher.token, s.records())).status).toBe(200);
    const res = await put(s.id, s.teacher.token, s.records());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(ErrorCode.ATTENDANCE_ALREADY_TAKEN);
  });

  it('FR-ATT-01 2 PUT song song -> 1×200, 1×409, đúng N bản ghi', async () => {
    const s = await seed(5);
    const [a, b] = await Promise.all([put(s.id, s.teacher.token, s.records()), put(s.id, s.assistant.token, s.records())]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await t.conn.model('Attendance').countDocuments({ sessionId: s.id })).toBe(5);
  });

  it('FR-ATT-01 buổi không tồn tại / id sai định dạng -> 404', async () => {
    const tok = await tokenFor(Role.ACADEMIC_STAFF);
    expect((await put(String(new Types.ObjectId()), tok, { records: [{ studentId: String(new Types.ObjectId()), status: 'PRESENT' }] })).status).toBe(404);
    expect((await get('not-an-id', tok)).status).toBe(404);
  });

  it('FR-ATT-01 body không hợp lệ -> 400 VALIDATION_FAILED', async () => {
    const s = await seed(1);
    const res = await put(s.id, s.teacher.token, { records: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});
