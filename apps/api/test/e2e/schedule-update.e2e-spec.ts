import { Types } from 'mongoose';
import { AuditAction, ClassStatus, ErrorCode, Role } from '@lc/shared';
import { makeClass, makeSession } from '../factories/academic.factory';
import { makeRoom } from '../factories/catalog.factory';
import { makeUser } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

describe('FR-SCH-04 FR-SCH-05 Sửa và hủy buổi học', () => {
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

  const tokenFor = async (role: Role) =>
    (await loginAs(t, role, role === Role.STUDENT ? { studentId: new Types.ObjectId() } : {})).token;
  const auth = (req: import('supertest').Test, token: string) => req.set('Authorization', `Bearer ${token}`);
  const patch = (id: string, token: string, body: object) => auth(t.http().patch(`/api/v1/sessions/${id}`), token).send(body);
  const cancel = (id: string, token: string, body: object) => auth(t.http().post(`/api/v1/sessions/${id}/cancel`), token).send(body);
  const cancelFuture = (id: string, token: string, body: object) =>
    auth(t.http().post(`/api/v1/classes/${id}/sessions/cancel-future`), token).send(body);

  async function seed(over: Record<string, unknown> = {}) {
    const cls = await makeClass(t.conn);
    const room = await makeRoom(t.conn, { capacity: 30 });
    const session = await makeSession(t.conn, {
      classId: cls._id,
      roomId: room._id,
      startAt: new Date('2026-01-06T11:00:00Z'),
      endAt: new Date('2026-01-06T12:30:00Z'),
      ...over,
    });
    return { cls, room, session, id: String(session._id) };
  }

  describe('PATCH /sessions/:id', () => {
    it('FR-SCH-04 đổi giờ không xung đột với chính nó -> 200, ghi audit', async () => {
      const s = await seed();
      const res = await patch(s.id, manager, { startAt: '2026-01-06T11:30:00.000Z', endAt: '2026-01-06T13:00:00.000Z' });
      expect(res.status).toBe(200);
      expect(res.body.data.session).toMatchObject({ id: s.id, startAt: '2026-01-06T11:30:00.000Z' });
      expect(res.body.data.warnings).toEqual([]);
      expect(await t.conn.model('AuditLog').countDocuments({ entity: 'Session', entityId: s.session._id, action: AuditAction.UPDATE })).toBe(1);
    });

    it('FR-SCH-04 R12 đổi giờ buổi đã có bản ghi điểm danh -> attendance.startAt cập nhật cùng transaction', async () => {
      const s = await seed();
      const base = { sessionId: s.session._id, classId: s.cls._id, enrollmentId: new Types.ObjectId(), status: 'PRESENT', history: [] };
      await t.conn.collection('attendances').insertMany([
        { ...base, studentId: new Types.ObjectId(), startAt: s.session.startAt },
        { ...base, studentId: new Types.ObjectId(), startAt: s.session.startAt },
      ]);
      const res = await patch(s.id, manager, { startAt: '2026-01-06T11:30:00.000Z', endAt: '2026-01-06T13:00:00.000Z' });
      expect(res.status).toBe(200);
      const rows = await t.conn.collection('attendances').find({ sessionId: s.session._id }).toArray();
      expect(rows.map((r) => (r.startAt as Date).toISOString())).toEqual(['2026-01-06T11:30:00.000Z', '2026-01-06T11:30:00.000Z']);
    });

    it('FR-SCH-04 đổi phòng gây xung đột -> 409 SCHEDULE_CONFLICT', async () => {
      const s = await seed();
      const otherRoom = await makeRoom(t.conn);
      const other = await makeClass(t.conn);
      await makeSession(t.conn, { classId: other._id, roomId: otherRoom._id, teacherId: (await makeUser(t.conn, { role: Role.TEACHER }))._id, startAt: new Date('2026-01-06T11:30:00Z'), endAt: new Date('2026-01-06T12:00:00Z') });
      const res = await patch(s.id, staff, { roomId: String(otherRoom._id) });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.SCHEDULE_CONFLICT);
    });

    it('FR-SCH-04 đổi sang phòng nhỏ hơn sĩ số -> 200 kèm ROOM_TOO_SMALL', async () => {
      const s = await seed();
      const small = await makeRoom(t.conn, { capacity: 5 });
      const res = await patch(s.id, manager, { roomId: String(small._id) });
      expect(res.status).toBe(200);
      expect(res.body.data.warnings[0]).toMatchObject({ code: 'ROOM_TOO_SMALL', roomCapacity: 5 });
    });

    it('FR-SCH-04 giờ mới ngoài khoảng ngày của lớp -> 422 SESSION_OUTSIDE_CLASS_RANGE', async () => {
      const s = await seed();
      const res = await patch(s.id, manager, { startAt: '2026-06-06T11:00:00.000Z', endAt: '2026-06-06T12:30:00.000Z' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_OUTSIDE_CLASS_RANGE);
    });

    it('FR-SCH-04 giáo viên mới không hợp lệ -> 400 VALIDATION_FAILED', async () => {
      const s = await seed();
      const notTeacher = await makeUser(t.conn, { role: Role.ACADEMIC_STAFF });
      const res = await patch(s.id, manager, { teacherId: String(notTeacher._id) });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it.each([ClassStatus.FINISHED, ClassStatus.INACTIVE])('FR-SCH-04 sửa buổi của lớp %s -> 422 CLASS_NOT_OPEN', async (status) => {
      const { cls, id } = await seed();
      await t.conn.model('Class').updateOne({ _id: cls._id }, { $set: { status } });
      const res = await patch(id, manager, { startAt: '2026-01-06T12:00:00.000Z', endAt: '2026-01-06T13:30:00.000Z' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.CLASS_NOT_OPEN);
    });

    it('FR-SCH-04 id không tồn tại -> 404', async () => {
      const res = await patch(String(new Types.ObjectId()), manager, { roomId: String(new Types.ObjectId()) });
      expect(res.status).toBe(404);
    });

    it('FR-SCH-04 đổi giờ buổi đã điểm danh -> 422 SESSION_LOCKED', async () => {
      const s = await seed({ attendanceTakenAt: new Date('2026-01-05T01:00:00Z') });
      const res = await patch(s.id, manager, { startAt: '2026-01-06T11:30:00.000Z', endAt: '2026-01-06T13:00:00.000Z' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_LOCKED);
    });

    it('FR-SCH-04 đổi giờ buổi đã qua -> 422 SESSION_LOCKED', async () => {
      const s = await seed({ startAt: new Date('2026-01-03T11:00:00Z'), endAt: new Date('2026-01-03T12:30:00Z') });
      const res = await patch(s.id, manager, { startAt: '2026-01-06T11:30:00.000Z', endAt: '2026-01-06T13:00:00.000Z' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_LOCKED);
    });

    it('FR-SCH-04 đổi phòng buổi đã qua -> 422 SESSION_LOCKED', async () => {
      const s = await seed({ startAt: new Date('2026-01-03T11:00:00Z'), endAt: new Date('2026-01-03T12:30:00Z') });
      const res = await patch(s.id, manager, { roomId: String((await makeRoom(t.conn))._id) });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_LOCKED);
    });

    it('FR-SCH-04 sửa buổi đã hủy -> 422 SESSION_LOCKED', async () => {
      const s = await seed({ status: 'CANCELLED', cancelReason: 'x' });
      const res = await patch(s.id, manager, { roomId: String((await makeRoom(t.conn))._id) });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_LOCKED);
    });

    it('FR-SCH-04 buổi đã khóa trả 422 SESSION_LOCKED dù payload phòng/GV không hợp lệ', async () => {
      const s = await seed({ startAt: new Date('2026-01-03T11:00:00Z'), endAt: new Date('2026-01-03T12:30:00Z') });
      const badRoom = await patch(s.id, manager, { roomId: String(new Types.ObjectId()) });
      expect(badRoom.status).toBe(422);
      expect(badRoom.body.error.code).toBe(ErrorCode.SESSION_LOCKED);
      const notTeacher = await makeUser(t.conn, { role: Role.ACADEMIC_STAFF });
      const badTeacher = await patch(s.id, manager, { teacherId: String(notTeacher._id) });
      expect(badTeacher.status).toBe(422);
      expect(badTeacher.body.error.code).toBe(ErrorCode.SESSION_LOCKED);
    });

    it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('FR-SCH-04 %s -> 403', async (role) => {
      const s = await seed();
      expect((await patch(s.id, await tokenFor(role), { roomId: String(s.room._id) })).status).toBe(403);
    });
  });

  describe('POST /sessions/:id/cancel', () => {
    it('FR-SCH-05 hủy buổi tương lai -> 200, CANCELLED kèm lý do và audit', async () => {
      const s = await seed();
      const res = await cancel(s.id, manager, { reason: '  Giáo viên nghỉ  ' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: s.id, status: 'CANCELLED', cancelReason: 'Giáo viên nghỉ' });
      expect(await t.conn.model('AuditLog').countDocuments({ entity: 'Session', entityId: s.session._id, action: AuditAction.STATUS })).toBe(1);
    });

    it.each(['', '   '])('FR-SCH-05 lý do %j -> 400 REASON_REQUIRED', async (reason) => {
      const s = await seed();
      const res = await cancel(s.id, manager, { reason });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.REASON_REQUIRED);
    });

    it('FR-SCH-05 hủy buổi đã bắt đầu -> 422 SESSION_NOT_CANCELLABLE', async () => {
      const s = await seed({ startAt: new Date('2026-01-05T01:00:00Z'), endAt: new Date('2026-01-05T03:00:00Z') });
      const res = await cancel(s.id, manager, { reason: 'x' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_NOT_CANCELLABLE);
    });

    it('FR-SCH-05 hủy buổi đã CANCELLED -> 422 SESSION_NOT_CANCELLABLE', async () => {
      const s = await seed({ status: 'CANCELLED', cancelReason: 'x' });
      const res = await cancel(s.id, manager, { reason: 'y' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_NOT_CANCELLABLE);
    });

    it('FR-SCH-05 id không tồn tại -> 404', async () => {
      expect((await cancel(String(new Types.ObjectId()), manager, { reason: 'x' })).status).toBe(404);
    });

    it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('FR-SCH-05 %s -> 403', async (role) => {
      const s = await seed();
      expect((await cancel(s.id, await tokenFor(role), { reason: 'x' })).status).toBe(403);
    });
  });

  describe('POST /classes/:id/sessions/cancel-future', () => {
    it('FR-SCH-05 chỉ hủy buổi startAt > now, buổi đang diễn ra giữ nguyên', async () => {
      const cls = await makeClass(t.conn);
      const room = await makeRoom(t.conn);
      const mk = (start: string, end: string, over: object = {}) =>
        makeSession(t.conn, { classId: cls._id, roomId: room._id, startAt: new Date(start), endAt: new Date(end), ...over });
      const past = await mk('2026-01-03T11:00:00Z', '2026-01-03T12:30:00Z');
      const ongoing = await mk('2026-01-05T01:00:00Z', '2026-01-05T03:00:00Z');
      const f1 = await mk('2026-01-06T11:00:00Z', '2026-01-06T12:30:00Z');
      const f2 = await mk('2026-01-08T11:00:00Z', '2026-01-08T12:30:00Z');
      const already = await mk('2026-01-09T11:00:00Z', '2026-01-09T12:30:00Z', { status: 'CANCELLED', cancelReason: 'cũ' });
      const res = await cancelFuture(String(cls._id), staff, { reason: 'Nghỉ lễ' });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ cancelled: 2 });
      const status = async (d: { _id: unknown }) => (await t.conn.model('Session').findById(d._id))?.get('status');
      expect(await status(past)).toBe('SCHEDULED');
      expect(await status(ongoing)).toBe('SCHEDULED');
      expect(await status(f1)).toBe('CANCELLED');
      expect(await status(f2)).toBe('CANCELLED');
      expect((await t.conn.model('Session').findById(already._id))?.get('cancelReason')).toBe('cũ');
      expect(await t.conn.model('AuditLog').countDocuments({ entity: 'Session', action: AuditAction.STATUS, entityId: { $in: [f1._id, f2._id] } })).toBe(2);
    });

    it('FR-SCH-05 lý do rỗng -> 400 REASON_REQUIRED', async () => {
      const cls = await makeClass(t.conn);
      const res = await cancelFuture(String(cls._id), manager, { reason: ' ' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.REASON_REQUIRED);
    });

    it('FR-SCH-05 lớp không tồn tại -> 404', async () => {
      expect((await cancelFuture(String(new Types.ObjectId()), manager, { reason: 'x' })).status).toBe(404);
    });

    it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('FR-SCH-05 %s -> 403', async (role) => {
      const cls = await makeClass(t.conn);
      expect((await cancelFuture(String(cls._id), await tokenFor(role), { reason: 'x' })).status).toBe(403);
    });
  });
});
