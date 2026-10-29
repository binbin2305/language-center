import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { EnrollmentStatus, ErrorCode, NotificationRefType, NotificationType, Role } from '@lc/shared';
import { makeClass, makeEnrollment, makeSession } from '../factories/academic.factory';
import { makeRoom } from '../factories/catalog.factory';
import { makeStudent } from '../factories/student.factory';
import { makeUser } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

// DEFAULT_NOW = 2026-01-05T02:00:00Z (09:00 VN Monday)
describe('FR-SCH-06..08 Xem lịch theo phạm vi và thông báo', () => {
  let t: TestApp;
  let manager: string;
  let staff: string;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
  });
  beforeEach(() => t.clock.set(DEFAULT_NOW));
  afterAll(async () => {
    await t.close();
  });

  const get = (path: string, token: string) => t.http().get(`/api/v1/sessions${path}`).set('Authorization', `Bearer ${token}`);
  const send = (method: 'post' | 'patch', path: string, token: string, body: object) =>
    t.http()[method](`/api/v1/${path}`).set('Authorization', `Bearer ${token}`).send(body);
  const Q = '?from=2026-01-01&to=2026-01-31';
  const ids = (res: { body: { data: Array<{ id: string }> } }) => res.body.data.map((d) => d.id);
  const future = (days: number) => ({
    startAt: new Date(DEFAULT_NOW.getTime() + days * 86_400_000),
    endAt: new Date(DEFAULT_NOW.getTime() + days * 86_400_000 + 5_400_000),
  });

  describe('GET /sessions - khoảng ngày', () => {
    it('FR-SCH-06 thiếu from -> 400', async () => {
      expect((await get('?to=2026-01-31', manager)).status).toBe(400);
    });
    it('FR-SCH-06 to - from = 93 ngày -> 400 VALIDATION_FAILED fields.to', async () => {
      const res = await get('?from=2026-01-01&to=2026-04-04', manager);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(res.body.error.details.fields.to).toBeDefined();
    });
    it('FR-SCH-06 to - from = 92 ngày -> 200', async () => {
      expect((await get('?from=2026-01-01&to=2026-04-03', manager)).status).toBe(200);
    });
    it('FR-SCH-06 to < from -> 400', async () => {
      expect((await get('?from=2026-01-10&to=2026-01-09', manager)).status).toBe(400);
    });
    it('FR-SCH-06 cửa sổ theo ngày VN: 00:00 VN thuộc ngày đó, 24:00 thì không', async () => {
      const cls = await makeClass(t.conn);
      const room = await makeRoom(t.conn);
      const inside = await makeSession(t.conn, { classId: cls._id, roomId: room._id, startAt: new Date('2026-01-09T17:00:00Z'), endAt: new Date('2026-01-09T18:00:00Z') });
      const outside = await makeSession(t.conn, { classId: cls._id, roomId: room._id, startAt: new Date('2026-01-10T17:00:00Z'), endAt: new Date('2026-01-10T18:00:00Z') });
      const res = await get(`?from=2026-01-10&to=2026-01-10&classId=${cls._id}`, manager);
      expect(ids(res)).toEqual([String(inside._id)]);
      expect(ids(res)).not.toContain(String(outside._id));
    });
  });

  describe('GET /sessions - phạm vi vai trò', () => {
    it('FR-SCH-06 ADMIN -> 403', async () => {
      const { token } = await loginAs(t, Role.ADMIN);
      expect((await get(Q, token)).status).toBe(403);
    });

    it('FR-SCH-06 HV: buổi tương lai lớp ENROLLED; buổi đã qua lớp TRANSFERRED; không thấy buổi tương lai lớp TRANSFERRED', async () => {
      const student = await makeStudent(t.conn);
      const room = await makeRoom(t.conn);
      const cur = await makeClass(t.conn);
      const old = await makeClass(t.conn);
      await makeEnrollment(t.conn, { studentId: student._id, classId: cur._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: student._id, classId: old._id, status: EnrollmentStatus.TRANSFERRED });
      const mk = (cls: typeof cur, when: { startAt: Date; endAt: Date }) => makeSession(t.conn, { classId: cls._id, roomId: room._id, ...when });
      const curFuture = await mk(cur, future(2));
      const curPast = await mk(cur, { startAt: new Date('2026-01-02T11:00:00Z'), endAt: new Date('2026-01-02T12:00:00Z') });
      const oldPast = await mk(old, { startAt: new Date('2026-01-02T11:00:00Z'), endAt: new Date('2026-01-02T12:00:00Z') });
      const oldFuture = await mk(old, future(3));
      const other = await mk(await makeClass(t.conn), future(2));
      const { token } = await loginAs(t, Role.STUDENT, { studentId: student._id });
      const res = await get(Q, token);
      expect(res.status).toBe(200);
      const got = ids(res);
      expect(got).toContain(String(curFuture._id));
      expect(got).toContain(String(oldPast._id));
      expect(got).not.toContain(String(oldFuture._id));
      expect(got).not.toContain(String(other._id));
      // Past sessions of the current class are visible through the 'history' scope as well.
      expect(got).toContain(String(curPast._id));
      // Single-session scope matches.
      expect((await get(`/${oldFuture._id}`, token)).status).toBe(404);
      expect((await get(`/${curFuture._id}`, token)).status).toBe(200);
    });

    it('FR-SCH-06 GV: lớp mình (chính/trợ giảng) + buổi dạy thay; buổi lớp khác -> 404', async () => {
      const { token, user } = await loginAs(t, Role.TEACHER);
      const room = await makeRoom(t.conn);
      const main = await makeClass(t.conn, { teacherId: user._id });
      const assist = await makeClass(t.conn, { assistantTeacherId: user._id });
      const sub = await makeClass(t.conn);
      const foreign = await makeClass(t.conn);
      const sMain = await makeSession(t.conn, { classId: main._id, roomId: room._id, ...future(1) });
      const sAssist = await makeSession(t.conn, { classId: assist._id, roomId: room._id, ...future(1) });
      const sSub = await makeSession(t.conn, { classId: sub._id, roomId: room._id, teacherId: user._id, ...future(2) });
      const sSubOther = await makeSession(t.conn, { classId: sub._id, roomId: room._id, ...future(3) });
      const sForeign = await makeSession(t.conn, { classId: foreign._id, roomId: room._id, ...future(1) });
      const res = await get(Q, token);
      expect(res.status).toBe(200);
      expect(ids(res).sort()).toEqual([sMain, sAssist, sSub].map((s) => String(s._id)).sort());
      expect((await get(`/${sSub._id}`, token)).status).toBe(200);
      expect((await get(`/${sSubOther._id}`, token)).status).toBe(404);
      expect((await get(`/${sForeign._id}`, token)).status).toBe(404);
      // filters only narrow
      expect(ids(await get(`${Q}&classId=${foreign._id}`, token))).toEqual([]);
    });

    it('FR-SCH-06 M/S lọc classId, teacherId, roomId; sắp theo startAt, kèm tên hiển thị', async () => {
      const room1 = await makeRoom(t.conn, { name: 'Phòng A1' });
      const room2 = await makeRoom(t.conn);
      const teacher = await makeUser(t.conn, { role: Role.TEACHER, fullName: 'Cô Lan' });
      const c1 = await makeClass(t.conn, { teacherId: teacher._id });
      const c2 = await makeClass(t.conn);
      const late = await makeSession(t.conn, { classId: c1._id, roomId: room1._id, ...future(4) });
      const early = await makeSession(t.conn, { classId: c1._id, roomId: room1._id, ...future(1) });
      const s2 = await makeSession(t.conn, { classId: c2._id, roomId: room2._id, ...future(2) });
      for (const tok of [manager, staff]) {
        const byClass = await get(`${Q}&classId=${c1._id}`, tok);
        expect(ids(byClass)).toEqual([String(early._id), String(late._id)]);
        expect(byClass.body.data[0]).toMatchObject({ classCode: c1.code, roomName: 'Phòng A1', teacherName: 'Cô Lan' });
      }
      expect(ids(await get(`${Q}&roomId=${room2._id}`, manager))).toEqual([String(s2._id)]);
      expect(ids(await get(`${Q}&teacherId=${teacher._id}`, staff))).toEqual([String(early._id), String(late._id)]);
    });

    it('FR-SCH-08 completed true khi đã điểm danh và endAt < now; false khi chưa điểm danh', async () => {
      const cls = await makeClass(t.conn);
      const room = await makeRoom(t.conn);
      const when = { startAt: new Date('2026-01-03T11:00:00Z'), endAt: new Date('2026-01-03T12:00:00Z') };
      const done = await makeSession(t.conn, { classId: cls._id, roomId: room._id, ...when, attendanceTakenAt: new Date('2026-01-03T12:10:00Z') });
      const missed = await makeSession(t.conn, { classId: cls._id, roomId: room._id, startAt: new Date('2026-01-04T11:00:00Z'), endAt: new Date('2026-01-04T12:00:00Z') });
      const res = await get(`${Q}&classId=${cls._id}`, manager);
      const byId = new Map(res.body.data.map((d: { id: string; completed: boolean }) => [d.id, d.completed]));
      expect(byId.get(String(done._id))).toBe(true);
      expect(byId.get(String(missed._id))).toBe(false);
      expect((await get(`/${done._id}`, manager)).body.data.completed).toBe(true);
    });

    it('FR-SCH-06 GET /sessions/:id id không hợp lệ hoặc không tồn tại -> 404', async () => {
      expect((await get('/xyz', manager)).status).toBe(404);
      expect((await get(`/${new Types.ObjectId()}`, manager)).status).toBe(404);
    });
  });

  describe('Thông báo (FR-SCH-07)', () => {
    async function seedClass() {
      const teacher = await makeUser(t.conn, { role: Role.TEACHER });
      const assistant = await makeUser(t.conn, { role: Role.TEACHER });
      const cls = await makeClass(t.conn, { teacherId: teacher._id, assistantTeacherId: assistant._id, code: `F-NTF-${new Types.ObjectId()}` });
      const room = await makeRoom(t.conn);
      const enrolled = await makeStudent(t.conn, { withUser: true });
      const enrolled2 = await makeStudent(t.conn, { withUser: true });
      const waiting = await makeStudent(t.conn, { withUser: true });
      const transferred = await makeStudent(t.conn, { withUser: true });
      await makeEnrollment(t.conn, { studentId: enrolled._id, classId: cls._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: enrolled2._id, classId: cls._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: waiting._id, classId: cls._id, status: EnrollmentStatus.WAITING_CLASS });
      await makeEnrollment(t.conn, { studentId: transferred._id, classId: cls._id, status: EnrollmentStatus.TRANSFERRED });
      const expected = [teacher._id, assistant._id, enrolled.userId!, enrolled2.userId!].map(String).sort();
      return { teacher, cls, room, expected, excluded: [waiting.userId!, transferred.userId!] };
    }
    const notes = (refId: unknown) => t.conn.model('Notification').find({ refId }).lean();
    const userSet = (rows: Array<Record<string, unknown>>) => rows.map((r) => String(r.userId)).sort();

    it('FR-SCH-07 tạo bulk -> một thông báo mỗi người cho cả series (CLASS), HV WAITING_CLASS/TRANSFERRED không nhận', async () => {
      const s = await seedClass();
      const res = await send('post', 'sessions/bulk', manager, {
        classId: String(s.cls._id), roomId: String(s.room._id), teacherId: String(s.teacher._id),
        weekdays: [1, 3], startTime: '18:00', endTime: '19:30', fromDate: '2026-01-05', toDate: '2026-01-16',
      });
      expect(res.status).toBe(201);
      const rows = await notes(s.cls._id);
      expect(rows).toHaveLength(4);
      expect(userSet(rows)).toEqual(s.expected);
      expect(rows[0]).toMatchObject({ type: NotificationType.SESSION_CREATED, refType: NotificationRefType.CLASS, title: 'Lịch học mới' });
      expect(rows[0].body).toContain(`Lớp ${s.cls.code}`);
      expect(rows[0].body).toContain('4 buổi từ 05/01/2026 đến 14/01/2026');
    });

    it('FR-SCH-07 tạo một buổi -> SESSION_CREATED, giờ VN trong nội dung', async () => {
      const s = await seedClass();
      const res = await send('post', 'sessions', staff, {
        classId: String(s.cls._id), roomId: String(s.room._id), teacherId: String(s.teacher._id),
        startAt: '2026-01-06T11:00:00.000Z', endAt: '2026-01-06T12:30:00.000Z',
      });
      expect(res.status).toBe(201);
      const rows = await notes(new Types.ObjectId(res.body.data.session.id));
      expect(userSet(rows)).toEqual(s.expected);
      expect(rows[0]).toMatchObject({ type: NotificationType.SESSION_CREATED, refType: NotificationRefType.SESSION, body: `Lớp ${s.cls.code}: 18:00 06/01/2026` });
    });

    it('FR-SCH-07 sửa -> SESSION_UPDATED; hủy -> SESSION_CANCELLED', async () => {
      const s = await seedClass();
      const session = await makeSession(t.conn, { classId: s.cls._id, roomId: s.room._id, teacherId: s.teacher._id, ...future(2) });
      const upd = await send('patch', `sessions/${session._id}`, manager, { roomId: String((await makeRoom(t.conn))._id) });
      expect(upd.status).toBe(200);
      let rows = await notes(session._id);
      expect(userSet(rows)).toEqual(s.expected);
      expect(new Set(rows.map((r) => r.type))).toEqual(new Set([NotificationType.SESSION_UPDATED]));

      const can = await send('post', `sessions/${session._id}/cancel`, manager, { reason: 'GV ốm' });
      expect(can.status).toBe(200);
      rows = (await notes(session._id)).filter((r) => r.type === NotificationType.SESSION_CANCELLED);
      expect(userSet(rows)).toEqual(s.expected);
      expect(rows[0].body).toContain('GV ốm');
    });

    it('FR-SCH-07 PATCH không thay đổi gì -> không gửi thông báo', async () => {
      const s = await seedClass();
      const session = await makeSession(t.conn, { classId: s.cls._id, roomId: s.room._id, teacherId: s.teacher._id, ...future(2) });
      expect((await send('patch', `sessions/${session._id}`, manager, {})).status).toBe(200);
      expect(await notes(session._id)).toHaveLength(0);
    });

    it('FR-SCH-07 cancel-future -> một thông báo mỗi người (CLASS) khi cancelled > 0; 0 buổi thì không gửi', async () => {
      const s = await seedClass();
      await makeSession(t.conn, { classId: s.cls._id, roomId: s.room._id, teacherId: s.teacher._id, ...future(2) });
      await makeSession(t.conn, { classId: s.cls._id, roomId: s.room._id, teacherId: s.teacher._id, ...future(3) });
      const res = await send('post', `classes/${s.cls._id}/sessions/cancel-future`, manager, { reason: 'Nghỉ lễ' });
      expect(res.body.data.cancelled).toBe(2);
      const rows = await notes(s.cls._id);
      expect(rows).toHaveLength(4);
      expect(userSet(rows)).toEqual(s.expected);
      expect(rows[0]).toMatchObject({ type: NotificationType.SESSION_CANCELLED, refType: NotificationRefType.CLASS });
      const again = await send('post', `classes/${s.cls._id}/sessions/cancel-future`, manager, { reason: 'Nghỉ lễ' });
      expect(again.body.data.cancelled).toBe(0);
      expect(await notes(s.cls._id)).toHaveLength(4);
    });

    it('FR-SCH-07 giao dịch thất bại (xung đột) -> không gửi thông báo', async () => {
      const s = await seedClass();
      const body = {
        classId: String(s.cls._id), roomId: String(s.room._id), teacherId: String(s.teacher._id),
        startAt: '2026-01-06T11:00:00.000Z', endAt: '2026-01-06T12:30:00.000Z',
      };
      expect((await send('post', 'sessions', manager, body)).status).toBe(201);
      expect((await send('post', 'sessions', manager, body)).status).toBe(409);
      expect(await t.conn.model('Notification').countDocuments({ userId: s.teacher._id })).toBe(1);
    });

    it('FR-SCH-07 lỗi gửi thông báo không biến ghi đã commit thành 500', async () => {
      const s = await seedClass();
      const NotificationModel = t.conn.model('Notification');
      const spy = jest.spyOn(NotificationModel, 'insertMany').mockRejectedValueOnce(new Error('boom'));
      const quiet = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      try {
        const res = await send('post', 'sessions', manager, {
          classId: String(s.cls._id), roomId: String(s.room._id), teacherId: String(s.teacher._id),
          startAt: '2026-01-07T11:00:00.000Z', endAt: '2026-01-07T12:30:00.000Z',
        });
        expect(res.status).toBe(201);
        expect(await t.conn.model('Session').countDocuments({ classId: s.cls._id })).toBe(1);
        expect(quiet).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
        quiet.mockRestore();
      }
    });
  });
});
