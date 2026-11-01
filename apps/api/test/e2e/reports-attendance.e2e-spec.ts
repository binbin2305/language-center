import { ALL_ROLES, AttendanceStatus, Role, SessionStatus } from '@lc/shared';
import { makeAttendance, makeClass, makeCourse, makeEnrollment, makeSession, makeStudent } from '../factories';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const vn = (d: string, hhmm = '09:00') => new Date(`${d}T${hhmm}:00+07:00`);
const FROM = '2026-01-10';
const TO = '2026-01-12';
const { PRESENT, LATE, EXCUSED, UNEXCUSED } = AttendanceStatus;

describe('FR-RPT-02 Báo cáo chuyên cần (GET /reports/attendance)', () => {
  let t: TestApp;
  let manager: string;
  let courseA: string;
  let classA: { id: string; code: string };
  let classB: { id: string; code: string };
  let s1: { id: string; code: string; name: string };
  let s2: { id: string; code: string; name: string };
  let s3: { id: string; code: string; name: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (token: string, qs: string) => t.http().get(`/api/v1/reports/attendance?${qs}`).set(auth(token));

  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    const course = await makeCourse(t.conn);
    const other = await makeCourse(t.conn);
    courseA = course._id.toString();
    const a = await makeClass(t.conn, { courseId: course._id });
    const b = await makeClass(t.conn, { courseId: other._id });
    classA = { id: a._id.toString(), code: a.code };
    classB = { id: b._id.toString(), code: b.code };
    const mk = async () => {
      const s = await makeStudent(t.conn);
      return { doc: s, v: { id: s._id.toString(), code: s.code, name: s.fullName } };
    };
    const m1 = await mk();
    const m2 = await mk();
    const m3 = await mk();
    s1 = m1.v;
    s2 = m2.v;
    s3 = m3.v;
    const enr = (s: { _id: unknown }, c: { _id: unknown }) =>
      makeEnrollment(t.conn, { studentId: s._id as never, courseId: (c === a ? course : other)._id, classId: c._id as never, status: 'ENROLLED' });
    const eA1 = await enr(m1.doc, a);
    const eA2 = await enr(m2.doc, a);
    const eA3 = await enr(m3.doc, a);
    const eB1 = await enr(m1.doc, b);

    const sess = (cls: typeof a, day: string, extra = {}) => makeSession(t.conn, { classId: cls._id, startAt: vn(day), endAt: vn(day, '11:00'), ...extra });
    const rec = (session: { _id: unknown }, cls: typeof a, s: typeof m1, e: typeof eA1, status: AttendanceStatus) =>
      makeAttendance(t.conn, { sessionId: session._id as never, classId: cls._id, studentId: s.doc._id, enrollmentId: e._id, status });
    // Lớp A, 5 buổi trong khoảng. s1: 4 PRESENT/LATE + 1 EXCUSED (absence 0.2 = ngưỡng); s2: 3 vắng / 5 (0.6); s3: 1 vắng/5 -> 0.2 ... dùng 5 buổi
    const days = ['2026-01-10', '2026-01-10', '2026-01-11', '2026-01-12', '2026-01-12'];
    const sessions = [];
    for (const [i, d] of days.entries()) sessions.push(await sess(a, d, { startAt: vn(d, `0${i + 1}:00`), endAt: vn(d, `0${i + 1}:50`) }));
    const plan: Record<string, AttendanceStatus[]> = {
      s1: [PRESENT, PRESENT, LATE, PRESENT, EXCUSED], // absence 0.2 (== ngưỡng, không tính)
      s2: [UNEXCUSED, EXCUSED, PRESENT, UNEXCUSED, PRESENT], // absence 0.6
      s3: [PRESENT, PRESENT, PRESENT, PRESENT, PRESENT],
    };
    for (const [i, se] of sessions.entries()) {
      await rec(se, a, m1, eA1, plan.s1[i]);
      await rec(se, a, m2, eA2, plan.s2[i]);
      await rec(se, a, m3, eA3, plan.s3[i]);
    }
    // Ngoài khoảng: không tính
    const out = await sess(a, '2026-01-13', { startAt: vn('2026-01-13', '00:00') });
    await rec(out, a, m1, eA1, UNEXCUSED);
    const before = await sess(a, '2026-01-09', { startAt: vn('2026-01-09', '23:59'), endAt: vn('2026-01-10', '00:30') });
    await rec(before, a, m2, eA2, UNEXCUSED);
    // Buổi hủy: không tính (khớp /attendance/summary)
    const cancelled = await sess(a, '2026-01-11', { status: SessionStatus.CANCELLED, cancelReason: 'nghỉ lễ', startAt: vn('2026-01-11', '15:00'), endAt: vn('2026-01-11', '16:00') });
    await rec(cancelled, a, m2, eA2, UNEXCUSED);
    // Lớp B: s1 1 buổi
    const bs = await sess(b, '2026-01-11');
    await rec(bs, b, m1, eB1, PRESENT);
  });
  afterAll(async () => {
    await t.close();
  });

  it('FR-RPT-02 byClass[].attendanceRate khớp GET /attendance/summary?groupBy=class cùng from/to', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}`);
    expect(r.status).toBe(200);
    const sum = await t.http().get(`/api/v1/attendance/summary?groupBy=class&from=${FROM}&to=${TO}`).set(auth(manager));
    expect(sum.status).toBe(200);
    expect(r.body.data.byClass.length).toBe(2);
    expect(sum.body.data.length).toBe(2);
    for (const row of sum.body.data) {
      const mine = r.body.data.byClass.find((c: { classId: string }) => c.classId === row.key);
      expect(mine).toBeDefined();
      expect(mine.attendanceRate).toBe(row.attendanceRate);
      expect(mine.records).toBe(row.total);
      expect(mine.classCode).toBe(row.label);
    }
    const a = r.body.data.byClass.find((c: { classId: string }) => c.classId === classA.id);
    expect(a).toMatchObject({ classCode: classA.code, sessions: 5, records: 15 });
    expect(a.attendanceRate).toBe(0.7333); // 11/15 làm tròn 4 chữ số
  });

  it('FR-RPT-02 byStudent đúng số bản ghi, vắng và tỷ lệ', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${classA.id}`);
    const by = (id: string) => r.body.data.byStudent.find((x: { studentId: string }) => x.studentId === id);
    expect(by(s1.id)).toMatchObject({ studentCode: s1.code, fullName: s1.name, classId: classA.id, records: 5, absences: 1, attendanceRate: 0.8 });
    expect(by(s2.id)).toMatchObject({ records: 5, absences: 3, attendanceRate: 0.4 });
    expect(by(s3.id)).toMatchObject({ records: 5, absences: 0, attendanceRate: 1 });
    expect(r.body.data.byStudent).toHaveLength(3);
  });

  it('FR-RPT-02 overThreshold chỉ HV có absenceRate > ngưỡng (=ngưỡng 0.2 không tính)', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}`);
    expect(r.body.data.overThreshold).toEqual([
      { studentId: s2.id, studentCode: s2.code, fullName: s2.name, classId: classA.id, classCode: classA.code, absenceRate: 0.6 },
    ]);
  });

  it('FR-RPT-02 ngưỡng lấy từ cài đặt: đổi 0.1 thì HV 0.2 bị tính', async () => {
    await t.http().patch('/api/v1/settings').set(auth(manager)).send({ attendanceWarningThreshold: 0.1 }).expect(200);
    const r = await get(manager, `from=${FROM}&to=${TO}`);
    expect(r.body.data.overThreshold.map((x: { studentId: string }) => x.studentId).sort()).toEqual([s1.id, s2.id].sort());
    await t.http().patch('/api/v1/settings').set(auth(manager)).send({ attendanceWarningThreshold: 0.2 }).expect(200);
  });

  it('FR-RPT-02 buổi ngoài khoảng (00:00 VN to+1, 23:59 VN trước from) không tính', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${classA.id}`);
    expect(r.body.data.byClass[0].records).toBe(15);
  });

  it('FR-RPT-02 classId lọc theo lớp', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${classB.id}`);
    expect(r.body.data.byClass.map((c: { classId: string }) => c.classId)).toEqual([classB.id]);
    expect(r.body.data.byStudent).toHaveLength(1);
  });

  it('FR-RPT-02 courseId lọc theo khóa', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&courseId=${courseA}`);
    expect(r.body.data.byClass.map((c: { classId: string }) => c.classId)).toEqual([classA.id]);
  });

  it('FR-RPT-02 không có dữ liệu -> mảng rỗng, không lỗi', async () => {
    const r = await get(manager, 'from=2025-01-01&to=2025-01-02');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ byClass: [], byStudent: [], overThreshold: [] });
  });

  it('FR-RPT-02 to < from -> 400', async () => {
    expect((await get(manager, 'from=2026-01-12&to=2026-01-10')).status).toBe(400);
  });

  it('FR-RPT-02 ACADEMIC_STAFF xem được; TEACHER, HR/ADMIN, STUDENT -> 403', async () => {
    expect((await get((await loginAs(t, Role.ACADEMIC_STAFF)).token, `from=${FROM}&to=${TO}`)).status).toBe(200);
    for (const role of ALL_ROLES.filter((r) => r !== Role.MANAGER && r !== Role.ACADEMIC_STAFF)) {
      expect((await get((await loginAs(t, role)).token, `from=${FROM}&to=${TO}`)).status).toBe(403);
    }
  });
});
