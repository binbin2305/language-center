import { Types } from 'mongoose';
import { AttendanceStatus, EnrollmentStatus, Role, SessionStatus } from '@lc/shared';
import { makeClass, makeEnrollment, makeSession } from '../factories/academic.factory';
import { models } from '../factories/common';
import { makeStudent } from '../factories/student.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const S = AttendanceStatus;

describe('FR-ATT-04 Lịch sử và tổng hợp điểm danh', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const get = (path: string, token: string) =>
    t.http().get(`/api/v1/attendance${path}`).set('Authorization', `Bearer ${token}`);
  const staff = async () => (await loginAs(t, Role.ACADEMIC_STAFF)).token;

  /** One class, one student, sessions on consecutive days with the given statuses. */
  async function seed(statuses: AttendanceStatus[], opts: { enrStatus?: EnrollmentStatus; start?: Date } = {}) {
    const cls = await makeClass(t.conn);
    const st = await makeStudent(t.conn);
    const enr = await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: cls.courseId,
      classId: cls._id,
      status: opts.enrStatus ?? EnrollmentStatus.ENROLLED,
    });
    const base = (opts.start ?? new Date('2026-02-02T11:00:00Z')).getTime();
    const sessions = [];
    for (let i = 0; i < statuses.length; i++) {
      const startAt = new Date(base + i * 86_400_000);
      const se = await makeSession(t.conn, { classId: cls._id, startAt, endAt: new Date(startAt.getTime() + 7_200_000) });
      await models(t.conn).Attendance.create({
        sessionId: se._id, classId: cls._id, studentId: st._id, enrollmentId: enr._id, status: statuses[i], startAt,
      });
      sessions.push(se);
    }
    return { cls, st, enr, sessions };
  }

  it('FR-ATT-04 tỷ lệ = (PRESENT+LATE)/tổng: 2 PRESENT + 1 LATE + 1 UNEXCUSED → attendanceRate 0.75, absenceRate 0.25', async () => {
    const x = await seed([S.PRESENT, S.PRESENT, S.LATE, S.UNEXCUSED]);
    const res = await get(`/summary?groupBy=student&classId=${x.cls._id}`, await staff());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      key: String(x.st._id), label: x.st.fullName, PRESENT: 2, LATE: 1, EXCUSED: 0, UNEXCUSED: 1, total: 4,
      attendanceRate: 0.75, absenceRate: 0.25,
    });
  });

  it('FR-ATT-04 3 trên 7 → 0.4286 (làm tròn 4 chữ số)', async () => {
    const x = await seed([S.PRESENT, S.PRESENT, S.LATE, S.UNEXCUSED, S.UNEXCUSED, S.EXCUSED, S.EXCUSED]);
    const res = await get(`/summary?groupBy=student&classId=${x.cls._id}`, await staff());
    expect(res.body.data[0].attendanceRate).toBe(0.4286);
    expect(res.body.data[0].absenceRate).toBe(0.5714);
  });

  it('FR-ATT-04 buổi chưa điểm danh không tính (và buổi hủy bị loại)', async () => {
    const x = await seed([S.PRESENT]);
    await makeSession(t.conn, { classId: x.cls._id, startAt: new Date('2026-03-01T11:00:00Z'), endAt: new Date('2026-03-01T13:00:00Z') });
    const cancelled = await makeSession(t.conn, {
      classId: x.cls._id, startAt: new Date('2026-03-02T11:00:00Z'), endAt: new Date('2026-03-02T13:00:00Z'),
      status: SessionStatus.CANCELLED, cancelReason: 'nghỉ lễ',
      // Realistic: attendance on a cancelled session only exists when it was taken (early window) before the cancel.
      attendanceTakenAt: new Date('2026-03-02T10:50:00Z'),
    });
    await models(t.conn).Attendance.create({
      sessionId: cancelled._id, classId: x.cls._id, studentId: x.st._id, enrollmentId: x.enr._id, status: S.UNEXCUSED,
      startAt: cancelled.startAt,
    });
    const sum = await get(`/summary?groupBy=class&classId=${x.cls._id}`, await staff());
    expect(sum.body.data[0]).toMatchObject({ total: 1, PRESENT: 1, UNEXCUSED: 0, attendanceRate: 1 });
    const list = await get(`?classId=${x.cls._id}`, await staff());
    expect(list.body.meta.total).toBe(1);
  });

  it('FR-ATT-04 danh sách sắp sessionStartAt giảm dần, có studentName/classCode/sessionStartAt, phân trang', async () => {
    const x = await seed([S.PRESENT, S.LATE, S.EXCUSED]);
    const res = await get(`?classId=${x.cls._id}&limit=2`, await staff());
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
    expect(res.body.data.map((r: { status: string }) => r.status)).toEqual([S.EXCUSED, S.LATE]);
    expect(res.body.data[0]).toMatchObject({
      studentName: x.st.fullName, classCode: x.cls.code, sessionStartAt: x.sessions[2]!.startAt.toISOString(),
    });
    expect(res.body.data[0]._id).toBeUndefined();
  });

  it('FR-ATT-04 R12 bản ghi kiểu cũ (chưa migrate, không có startAt) → danh sách không lọc ngày vẫn 200 với sessionStartAt đúng', async () => {
    const x = await seed([S.PRESENT]);
    const se = await makeSession(t.conn, { classId: x.cls._id, startAt: new Date('2026-02-20T11:00:00Z'), endAt: new Date('2026-02-20T13:00:00Z') });
    await t.conn.collection('attendances').insertOne({
      sessionId: se._id, classId: x.cls._id, studentId: x.st._id, enrollmentId: x.enr._id, status: S.LATE, history: [],
    });
    const res = await get(`?classId=${x.cls._id}`, await staff());
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    const legacy = res.body.data.find((r: { sessionId: string }) => r.sessionId === String(se._id));
    expect(legacy).toMatchObject({ status: S.LATE, sessionStartAt: '2026-02-20T11:00:00.000Z' });
  });

  it('FR-ATT-04 R11 GV (bộ lọc phạm vi không rỗng) khi có bản ghi lớp khác → meta.total = số bản ghi lớp mình', async () => {
    const teacher = await loginAs(t, Role.TEACHER);
    const mine = await seed([S.PRESENT, S.LATE, S.EXCUSED]);
    await models(t.conn).Class.updateOne({ _id: mine.cls._id }, { teacherId: teacher.user._id });
    await seed([S.PRESENT, S.PRESENT]);
    const all = await models(t.conn).Attendance.countDocuments();
    const res = await get('', teacher.token);
    expect(res.status).toBe(200);
    expect(all).toBeGreaterThan(3);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.data).toHaveLength(3);
  });

  it('FR-ATT-04 HV chỉ thấy của mình (studentId người khác trong query → bị ghi đè, không lộ)', async () => {
    const mine = await seed([S.PRESENT]);
    const other = await seed([S.UNEXCUSED]);
    const { token } = await loginAs(t, Role.STUDENT, { studentId: mine.st._id });
    const res = await get(`?studentId=${other.st._id}`, token);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { studentId: string }) => r.studentId)).toEqual([String(mine.st._id)]);
    const sum = await get(`/summary?groupBy=student&studentId=${other.st._id}&classId=${other.cls._id}`, token);
    expect(sum.body.data).toEqual([]);
  });

  it('FR-ATT-04 HV TRANSFERRED vẫn thấy bản ghi lớp cũ', async () => {
    const x = await seed([S.PRESENT, S.LATE], { enrStatus: EnrollmentStatus.TRANSFERRED });
    const { token } = await loginAs(t, Role.STUDENT, { studentId: x.st._id });
    const res = await get(`?classId=${x.cls._id}`, token);
    expect(res.body.data).toHaveLength(2);
  });

  it('FR-ATT-04 GV chỉ lớp mình (trợ giảng cũng vậy); GV dạy thay không thấy lớp đó', async () => {
    const main = await loginAs(t, Role.TEACHER);
    const assistant = await loginAs(t, Role.TEACHER);
    const sub = await loginAs(t, Role.TEACHER);
    const x = await seed([S.PRESENT]);
    await models(t.conn).Class.updateOne({ _id: x.cls._id }, { teacherId: main.user._id, assistantTeacherId: assistant.user._id });
    await models(t.conn).Session.updateOne({ _id: x.sessions[0]!._id }, { teacherId: sub.user._id });
    const y = await seed([S.LATE]);

    for (const who of [main, assistant]) {
      const res = await get('', who.token);
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: { classId: string }) => r.classId)).toEqual([String(x.cls._id)]);
      const sum = await get('/summary?groupBy=class', who.token);
      expect(sum.body.data.map((r: { key: string }) => r.key)).toEqual([String(x.cls._id)]);
    }
    const none = await get(`?classId=${x.cls._id}`, sub.token);
    expect(none.status).toBe(200);
    expect(none.body.data).toEqual([]);
    expect(none.body.meta.total).toBe(0);
    const other = await get(`?classId=${y.cls._id}`, main.token);
    expect(other.body.data).toEqual([]);
  });

  it('FR-ATT-04 from=to=2026-01-14 gồm buổi 14/01 18:00 VN (11:00Z) và loại buổi 15/01 00:30 VN (14/01 17:30Z)', async () => {
    const x = await seed([S.PRESENT]);
    const mk = async (iso: string, status: AttendanceStatus) => {
      const startAt = new Date(iso);
      const se = await makeSession(t.conn, { classId: x.cls._id, startAt, endAt: new Date(startAt.getTime() + 3_600_000) });
      await models(t.conn).Attendance.create({ sessionId: se._id, classId: x.cls._id, studentId: x.st._id, enrollmentId: x.enr._id, status, startAt });
      return se;
    };
    const inside = await mk('2026-01-14T11:00:00Z', S.LATE);
    await mk('2026-01-14T17:30:00Z', S.UNEXCUSED);
    const res = await get(`?classId=${x.cls._id}&from=2026-01-14&to=2026-01-14`, await staff());
    expect(res.body.data.map((r: { sessionId: string }) => r.sessionId)).toEqual([String(inside._id)]);
    const sum = await get(`/summary?groupBy=class&classId=${x.cls._id}&from=2026-01-14&to=2026-01-14`, await staff());
    expect(sum.body.data[0]).toMatchObject({ total: 1, LATE: 1 });
  });

  it('FR-ATT-04 groupBy=class → một dòng/lớp', async () => {
    const a = await seed([S.PRESENT, S.LATE], { start: new Date('2026-05-02T11:00:00Z') });
    const b = await seed([S.UNEXCUSED], { start: new Date('2026-05-02T11:00:00Z') });
    const res = await get('/summary?groupBy=class&from=2026-05-01&to=2026-05-31', await staff());
    const rows = res.body.data as { key: string; label: string; total: number }[];
    expect(rows.find((r) => r.key === String(a.cls._id))).toMatchObject({ label: a.cls.code, total: 2 });
    expect(rows.find((r) => r.key === String(b.cls._id))).toMatchObject({ label: b.cls.code, total: 1 });
    expect(rows.filter((r) => r.key === String(a.cls._id))).toHaveLength(1);
  });

  it('FR-ATT-04 không dữ liệu → data []', async () => {
    const res = await get(`/summary?groupBy=student&classId=${new Types.ObjectId()}`, await staff());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    const list = await get(`?classId=${new Types.ObjectId()}`, await staff());
    expect(list.body).toMatchObject({ data: [], meta: { total: 0 } });
  });

  it('FR-ATT-04 thiếu groupBy → 400', async () => {
    const res = await get('/summary', await staff());
    expect(res.status).toBe(400);
  });

  it('FR-ATT-04 Quản lý xem được; ADMIN → 403 cả hai endpoint', async () => {
    const m = (await loginAs(t, Role.MANAGER)).token;
    expect((await get('', m)).status).toBe(200);
    expect((await get('/summary?groupBy=class', m)).status).toBe(200);
    const a = (await loginAs(t, Role.ADMIN)).token;
    expect((await get('', a)).status).toBe(403);
    expect((await get('/summary?groupBy=class', a)).status).toBe(403);
  });

  it('FR-ATT-04 chưa đăng nhập → 401', async () => {
    expect((await t.http().get('/api/v1/attendance')).status).toBe(401);
  });
});
