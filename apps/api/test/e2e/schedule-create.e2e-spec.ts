import { Types } from 'mongoose';
import { AuditAction, ErrorCode, Role, RoomStatus } from '@lc/shared';
import { makeClass, makeSession } from '../factories/academic.factory';
import { makeRoom } from '../factories/catalog.factory';
import { makeUser } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-SCH-01..03 Tạo buổi học và lịch lặp', () => {
  let t: TestApp;
  let manager: string;
  let staff: string;
  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, token: string, body: object) =>
    t.http().post(`/api/v1/sessions${path}`).set('Authorization', `Bearer ${token}`).send(body);
  const count = () => t.conn.model('Session').countDocuments();

  async function seed(capacity = 30) {
    const teacher = await makeUser(t.conn, { role: Role.TEACHER });
    const room = await makeRoom(t.conn, { capacity });
    const cls = await makeClass(t.conn, { teacherId: teacher._id }); // 2026-01-05 .. 2026-04-05, max 20
    return { teacher, room, cls };
  }
  const bulkBody = (s: Awaited<ReturnType<typeof seed>>, over: Record<string, unknown> = {}) => ({
    classId: String(s.cls._id),
    roomId: String(s.room._id),
    teacherId: String(s.teacher._id),
    weekdays: [1, 3, 5],
    startTime: '18:00',
    endTime: '19:30',
    fromDate: '2026-01-05',
    toDate: '2026-01-30',
    ...over,
  });
  const singleBody = (s: Awaited<ReturnType<typeof seed>>, over: Record<string, unknown> = {}) => ({
    classId: String(s.cls._id),
    roomId: String(s.room._id),
    teacherId: String(s.teacher._id),
    startAt: '2026-01-06T11:00:00.000Z',
    endAt: '2026-01-06T12:30:00.000Z',
    ...over,
  });

  describe('POST /sessions/bulk', () => {
    it('FR-SCH-02 tạo đúng 12 buổi cùng seriesId, ghi audit', async () => {
      const s = await seed();
      const res = await post('/bulk', manager, bulkBody(s));
      expect(res.status).toBe(201);
      const { seriesId, sessions, warnings } = res.body.data;
      expect(sessions).toHaveLength(12);
      expect(warnings).toEqual([]);
      expect(seriesId).toMatch(/^[0-9a-f]{24}$/);
      expect(sessions.every((x: { seriesId: string }) => x.seriesId === seriesId)).toBe(true);
      expect(sessions[0]).toMatchObject({ startAt: '2026-01-05T11:00:00.000Z', endAt: '2026-01-05T12:30:00.000Z', status: 'SCHEDULED' });
      expect(await t.conn.model('Session').countDocuments({ classId: s.cls._id })).toBe(12);
      const audits = await t.conn.model('AuditLog').countDocuments({ entity: 'Session', action: AuditAction.CREATE, entityId: { $in: sessions.map((x: { id: string }) => new Types.ObjectId(x.id)) } });
      expect(audits).toBe(12);
    });

    it('FR-SCH-02 weekdays [1,1,3] không sinh buổi trùng, đúng 8 buổi', async () => {
      const s = await seed();
      const res = await post('/bulk', staff, bulkBody(s, { weekdays: [1, 1, 3], toDate: '2026-01-31' }));
      expect(res.status).toBe(201);
      expect(res.body.data.sessions).toHaveLength(8);
    });

    it('FR-SCH-03 một buổi trùng phòng với buổi có sẵn -> 409 SCHEDULE_CONFLICT, không ghi gì', async () => {
      const s = await seed();
      const other = await makeClass(t.conn);
      const existing = await makeSession(t.conn, {
        classId: other._id,
        roomId: s.room._id,
        teacherId: (await makeUser(t.conn, { role: Role.TEACHER }))._id,
        startAt: new Date('2026-01-14T11:30:00Z'),
        endAt: new Date('2026-01-14T13:00:00Z'),
      });
      const before = await count();
      const res = await post('/bulk', manager, bulkBody(s));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.SCHEDULE_CONFLICT);
      expect(res.body.error.details.conflicts).toHaveLength(1);
      expect(res.body.error.details.conflicts[0]).toMatchObject({ sessionId: String(existing._id), kind: 'ROOM', classCode: other.code });
      expect(await count()).toBe(before);
    });

    it('FR-SCH-03 liệt kê đủ mọi xung đột của nhiều buổi', async () => {
      const s = await seed();
      const other = await makeClass(t.conn);
      const otherTeacher = (await makeUser(t.conn, { role: Role.TEACHER }))._id;
      for (const d of ['2026-01-05', '2026-01-07']) {
        await makeSession(t.conn, { classId: other._id, roomId: s.room._id, teacherId: otherTeacher, startAt: new Date(`${d}T11:00:00Z`), endAt: new Date(`${d}T12:30:00Z`) });
      }
      const res = await post('/bulk', manager, bulkBody(s));
      expect(res.status).toBe(409);
      expect(res.body.error.details.conflicts).toHaveLength(2);
    });

    it('FR-SCH-03 buổi liền kề 19:30 không xung đột', async () => {
      const s = await seed();
      const other = await makeClass(t.conn);
      await makeSession(t.conn, { classId: other._id, roomId: s.room._id, teacherId: s.teacher._id, startAt: new Date('2026-01-05T12:30:00Z'), endAt: new Date('2026-01-05T14:00:00Z') });
      expect((await post('/bulk', manager, bulkBody(s))).status).toBe(201);
    });

    it('FR-SCH-01 buổi ngoài khoảng ngày của lớp -> 422 SESSION_OUTSIDE_CLASS_RANGE, không ghi gì', async () => {
      const s = await seed();
      const before = await count();
      const res = await post('/bulk', manager, bulkBody(s, { fromDate: '2026-04-01', toDate: '2026-04-10' }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_OUTSIDE_CLASS_RANGE);
      expect(await count()).toBe(before);
    });

    it('FR-SCH-02 endTime <= startTime -> 400', async () => {
      const s = await seed();
      const res = await post('/bulk', manager, bulkBody(s, { startTime: '19:30', endTime: '18:00' }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('FR-SCH-02 không có ngày nào khớp weekdays -> 400', async () => {
      const s = await seed();
      const res = await post('/bulk', manager, bulkBody(s, { weekdays: [7], fromDate: '2026-01-05', toDate: '2026-01-10' }));
      expect(res.status).toBe(400);
    });

    it('FR-SCH-01 phòng nhỏ hơn sĩ số tối đa -> 201 kèm cảnh báo ROOM_TOO_SMALL', async () => {
      const s = await seed(10);
      const res = await post('/bulk', manager, bulkBody(s));
      expect(res.status).toBe(201);
      expect(res.body.data.warnings[0]).toEqual({ code: 'ROOM_TOO_SMALL', roomCapacity: 10, classMaxCapacity: 20 });
    });

    it('FR-SCH-01 teacherId không phải TEACHER -> 400 fields.teacherId', async () => {
      const s = await seed();
      const notTeacher = await makeUser(t.conn, { role: Role.ACADEMIC_STAFF });
      const res = await post('/bulk', manager, bulkBody(s, { teacherId: String(notTeacher._id) }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields.teacherId).toBeDefined();
    });

    it('FR-SCH-01 roomId INACTIVE -> 400 fields.roomId', async () => {
      const s = await seed();
      const room = await makeRoom(t.conn, { status: RoomStatus.INACTIVE });
      const res = await post('/bulk', manager, bulkBody(s, { roomId: String(room._id) }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields.roomId).toBeDefined();
    });

    it('FR-SCH-01 lớp không tồn tại -> 404', async () => {
      const s = await seed();
      const res = await post('/bulk', manager, bulkBody(s, { classId: String(new Types.ObjectId()) }));
      expect(res.status).toBe(404);
    });
  });

  describe('POST /sessions', () => {
    it('FR-SCH-01 tạo một buổi -> 201 CreateSessionResultDto, ghi audit', async () => {
      const s = await seed();
      const res = await post('', staff, singleBody(s));
      expect(res.status).toBe(201);
      expect(res.body.data.warnings).toEqual([]);
      expect(res.body.data.session).toMatchObject({ classId: String(s.cls._id), seriesId: null, startAt: '2026-01-06T11:00:00.000Z' });
      expect(await t.conn.model('AuditLog').countDocuments({ entity: 'Session', action: AuditAction.CREATE, entityId: new Types.ObjectId(res.body.data.session.id) })).toBe(1);
    });

    it('FR-SCH-03 trùng GV -> 409 SCHEDULE_CONFLICT với details.conflicts', async () => {
      const s = await seed();
      const other = await makeClass(t.conn);
      await makeSession(t.conn, { classId: other._id, roomId: (await makeRoom(t.conn))._id, teacherId: s.teacher._id, startAt: new Date('2026-01-06T11:30:00Z'), endAt: new Date('2026-01-06T13:00:00Z') });
      const before = await count();
      const res = await post('', manager, singleBody(s));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ErrorCode.SCHEDULE_CONFLICT);
      expect(res.body.error.details.conflicts[0].kind).toBe('TEACHER');
      expect(await count()).toBe(before);
    });

    it('FR-SCH-01 ngoài khoảng ngày của lớp -> 422 SESSION_OUTSIDE_CLASS_RANGE', async () => {
      const s = await seed();
      const res = await post('', manager, singleBody(s, { startAt: '2026-04-06T11:00:00.000Z', endAt: '2026-04-06T12:30:00.000Z' }));
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ErrorCode.SESSION_OUTSIDE_CLASS_RANGE);
    });

    it('FR-SCH-01 endAt <= startAt -> 400', async () => {
      const s = await seed();
      const res = await post('', manager, singleBody(s, { endAt: '2026-01-06T11:00:00.000Z' }));
      expect(res.status).toBe(400);
    });

    it('FR-SCH-01 phòng nhỏ -> 201 kèm ROOM_TOO_SMALL', async () => {
      const s = await seed(10);
      const res = await post('', manager, singleBody(s));
      expect(res.status).toBe(201);
      expect(res.body.data.warnings[0].code).toBe('ROOM_TOO_SMALL');
    });

    it('FR-SCH-01 teacherId không phải TEACHER -> 400 fields.teacherId', async () => {
      const s = await seed();
      const res = await post('', manager, singleBody(s, { teacherId: String((await makeUser(t.conn, { role: Role.MANAGER }))._id) }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields.teacherId).toBeDefined();
    });

    it('FR-SCH-01 roomId INACTIVE -> 400 fields.roomId', async () => {
      const s = await seed();
      const room = await makeRoom(t.conn, { status: RoomStatus.INACTIVE });
      const res = await post('', manager, singleBody(s, { roomId: String(room._id) }));
      expect(res.status).toBe(400);
      expect(res.body.error.details.fields.roomId).toBeDefined();
    });
  });

  describe('Đồng thời (FR-SCH-03)', () => {
    it('hai POST /sessions song song cùng phòng+GV+giờ -> [201, 409], count +1', async () => {
      const s = await seed();
      const before = await count();
      const rs = await Promise.all([post('', manager, singleBody(s)), post('', staff, singleBody(s))]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await count()).toBe(before + 1);
    });

    it('hai POST /sessions/bulk chồng nhau song song -> một 201, một 409', async () => {
      const s = await seed();
      const before = await count();
      const rs = await Promise.all([post('/bulk', manager, bulkBody(s)), post('/bulk', staff, bulkBody(s))]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await count()).toBe(before + 12);
    });
  });

  describe('POST /sessions/check-conflicts', () => {
    it('FR-SCH-03 trả danh sách xung đột và không ghi DB', async () => {
      const s = await seed();
      const other = await makeClass(t.conn);
      await makeSession(t.conn, { classId: other._id, roomId: s.room._id, teacherId: s.teacher._id, startAt: new Date('2026-01-06T11:00:00Z'), endAt: new Date('2026-01-06T12:30:00Z') });
      const before = await count();
      const res = await post('/check-conflicts', staff, { roomId: String(s.room._id), teacherId: String(s.teacher._id), startAt: '2026-01-06T11:30:00.000Z', endAt: '2026-01-06T13:00:00.000Z' });
      expect(res.status).toBe(200);
      expect(res.body.data.conflicts.map((c: { kind: string }) => c.kind).sort()).toEqual(['ROOM', 'TEACHER']);
      expect(await count()).toBe(before);
    });

    it('FR-SCH-03 không xung đột -> conflicts rỗng', async () => {
      const s = await seed();
      const res = await post('/check-conflicts', manager, { roomId: String(s.room._id), teacherId: String(s.teacher._id), startAt: '2026-01-06T11:00:00.000Z', endAt: '2026-01-06T12:30:00.000Z' });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ conflicts: [] });
    });

    it('FR-SCH-03 endAt <= startAt -> 400', async () => {
      const s = await seed();
      const res = await post('/check-conflicts', manager, { roomId: String(s.room._id), teacherId: String(s.teacher._id), startAt: '2026-01-06T12:00:00.000Z', endAt: '2026-01-06T11:00:00.000Z' });
      expect(res.status).toBe(400);
    });
  });

  describe('Phân quyền', () => {
    it.each([Role.TEACHER, Role.STUDENT])('%s -> 403 trên cả 3 endpoint', async (role) => {
      const { token } = await loginAs(t, role, role === Role.STUDENT ? { studentId: new Types.ObjectId() } : {});
      const s = await seed();
      expect((await post('', token, singleBody(s))).status).toBe(403);
      expect((await post('/bulk', token, bulkBody(s))).status).toBe(403);
      expect((await post('/check-conflicts', token, { roomId: String(s.room._id), teacherId: String(s.teacher._id), startAt: '2026-01-06T11:00:00.000Z', endAt: '2026-01-06T12:30:00.000Z' })).status).toBe(403);
    });
  });
});
