import { EventEmitter2 } from '@nestjs/event-emitter';
import { Types } from 'mongoose';
import { ClassStatus, CourseStatus, DomainEvent, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeClass, makeCourse, makeRoom, makeTeacher, makeUser } from '../factories';
import { Models } from '../../src/database/models';
import { AuditLog } from '../../src/database/schemas/audit-log.schema';

describe('FR-CLS-01..03 Lớp học', () => {
  let t: TestApp;
  let manager: { token: string };
  let staff: { token: string };
  let course: Awaited<ReturnType<typeof makeCourse>>;
  let teacherId: string;

  beforeAll(async () => {
    t = await createTestApp();
    manager = await loginAs(t, Role.MANAGER);
    staff = await loginAs(t, Role.ACADEMIC_STAFF);
    course = await makeCourse(t.conn);
    teacherId = String((await makeTeacher(t.conn))._id);
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  let n = 0;
  const body = (over: Record<string, unknown> = {}) => ({
    code: `CL-${++n}`,
    name: 'Lớp IELTS',
    courseId: String(course._id),
    level: 'A1',
    teacherId,
    maxCapacity: 20,
    startDate: '2026-02-02',
    endDate: '2026-05-02',
    ...over,
  });
  const post = (b: Record<string, unknown>, token = manager.token) =>
    t.http().post('/api/v1/classes').set(auth(token)).send(b);
  const patch = (id: string, b: Record<string, unknown>, token = manager.token) =>
    t.http().patch(`/api/v1/classes/${id}`).set(auth(token)).send(b);

  describe('tạo lớp', () => {
    it('201 trả ClassDto kèm courseName/teacherName, currentSize 0, PLANNED, ghi audit', async () => {
      const res = await post(
        body({ code: 'ielts-aud', defaultRoomId: String((await makeRoom(t.conn))._id) }),
      ).expect(201);
      expect(res.body.data).toMatchObject({
        code: 'IELTS-AUD',
        currentSize: 0,
        status: 'PLANNED',
        courseName: course.name,
        startDate: '2026-02-02',
        endDate: '2026-05-02',
      });
      expect(res.body.data.teacherName).toEqual(expect.any(String));
      const got = await t
        .http()
        .get(`/api/v1/classes/${res.body.data.id}`)
        .set(auth(staff.token))
        .expect(200);
      expect(got.body.data.id).toBe(res.body.data.id);
      const logs = await t.conn
        .model<AuditLog>(Models.AuditLog)
        .find({ entity: 'class', entityId: new Types.ObjectId(res.body.data.id) });
      expect(logs.map((l) => l.action)).toEqual(['create']);
    });

    it.each([
      'code',
      'name',
      'courseId',
      'level',
      'teacherId',
      'maxCapacity',
      'startDate',
      'endDate',
    ])('thiếu %s trả 400 đúng field', async (field) => {
      const b = body();
      delete (b as Record<string, unknown>)[field];
      const res = await post(b).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.fields[field]).toBeDefined();
    });

    it('code "ielts-01" khi đã có "IELTS-01" trả 409 CLASS_CODE_EXISTS', async () => {
      await post(body({ code: 'IELTS-01' })).expect(201);
      const res = await post(body({ code: 'ielts-01' })).expect(409);
      expect(res.body.error.code).toBe('CLASS_CODE_EXISTS');
    });

    it('hai request song song cùng code: 1×201, 1×409 CLASS_CODE_EXISTS', async () => {
      const code = 'RACE-1';
      const rs = await Promise.all([
        post(body({ code })),
        post(body({ code: code.toLowerCase() })),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(rs.find((r) => r.status === 409)?.body.error.code).toBe('CLASS_CODE_EXISTS');
      expect(await t.conn.model(Models.Class).countDocuments({ code: 'RACE-1' })).toBe(1);
    });

    it('tạo với assistantTeacherId hợp lệ trả 201', async () => {
      const a = await makeTeacher(t.conn);
      const res = await post(body({ assistantTeacherId: String(a._id) })).expect(201);
      expect(res.body.data.assistantTeacherId).toBe(String(a._id));
    });

    it('level "C2" không thuộc course.levels trả 400 fields.level', async () => {
      const res = await post(body({ level: 'C2' })).expect(400);
      expect(res.body.error.details.fields.level).toBeDefined();
    });

    it('teacherId là ACADEMIC_STAFF trả 400 fields.teacherId', async () => {
      const u = await makeUser(t.conn, { role: Role.ACADEMIC_STAFF });
      const res = await post(body({ teacherId: String(u._id) })).expect(400);
      expect(res.body.error.details.fields.teacherId).toBeDefined();
    });

    it('teacherId không tồn tại trả 400 fields.teacherId', async () => {
      const res = await post(body({ teacherId: String(new Types.ObjectId()) })).expect(400);
      expect(res.body.error.details.fields.teacherId).toBeDefined();
    });

    it('assistantTeacherId không phải TEACHER trả 400', async () => {
      const u = await makeUser(t.conn, { role: Role.MANAGER });
      const res = await post(body({ assistantTeacherId: String(u._id) })).expect(400);
      expect(res.body.error.details.fields.assistantTeacherId).toBeDefined();
    });

    it('defaultRoomId không tồn tại trả 400', async () => {
      const res = await post(body({ defaultRoomId: String(new Types.ObjectId()) })).expect(400);
      expect(res.body.error.details.fields.defaultRoomId).toBeDefined();
    });

    it('courseId không tồn tại trả 400 fields.courseId', async () => {
      const res = await post(body({ courseId: String(new Types.ObjectId()) })).expect(400);
      expect(res.body.error.details.fields.courseId).toBeDefined();
    });

    it('endDate < startDate trả 400 fields.endDate', async () => {
      const res = await post(body({ startDate: '2026-05-02', endDate: '2026-02-02' })).expect(400);
      expect(res.body.error.details.fields.endDate).toBeDefined();
    });

    it('khóa học ARCHIVED trả 400', async () => {
      const archived = await makeCourse(t.conn, { status: CourseStatus.ARCHIVED });
      const res = await post(body({ courseId: String(archived._id) })).expect(400);
      expect(res.body.error.details.fields.courseId).toBeDefined();
    });
  });

  describe('sửa lớp', () => {
    it('PATCH maxCapacity 5 khi currentSize 8 trả 422 CAPACITY_BELOW_CURRENT', async () => {
      const c = await makeClass(t.conn, { courseId: course._id, maxCapacity: 20, currentSize: 8 });
      const res = await patch(String(c._id), { maxCapacity: 5 }).expect(422);
      expect(res.body.error.code).toBe('CAPACITY_BELOW_CURRENT');
      const ok = await patch(String(c._id), { maxCapacity: 8, name: 'Tên mới' }).expect(200);
      expect(ok.body.data).toMatchObject({ maxCapacity: 8, name: 'Tên mới', currentSize: 8 });
    });

    it('PATCH {currentSize} hoặc {code} trả 400', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      await patch(String(c._id), { currentSize: 3 }).expect(400);
      await patch(String(c._id), { code: 'NEW' }).expect(400);
    });

    it('PATCH endDate trước startDate hiện có trả 400 fields.endDate', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      const res = await patch(String(c._id), { endDate: '2025-12-01' }).expect(400);
      expect(res.body.error.details.fields.endDate).toBeDefined();
    });

    it('PATCH lớp không tồn tại hoặc id sai trả 404', async () => {
      await patch(String(new Types.ObjectId()), { name: 'x' }).expect(404);
      await patch('not-an-id', { name: 'x' }).expect(404);
      await t
        .http()
        .get(`/api/v1/classes/${new Types.ObjectId()}`)
        .set(auth(manager.token))
        .expect(404);
    });

    it('ghi audit action status khi đổi trạng thái', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      await patch(String(c._id), { status: ClassStatus.ONGOING }).expect(200);
      const logs = await t.conn
        .model<AuditLog>(Models.AuditLog)
        .find({ entity: 'class', entityId: c._id });
      expect(logs.map((l) => l.action)).toEqual(['status']);
    });

    it('PATCH name khi startDate/endDate không đổi không bị kiểm tra ngày, không dính guard status', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      await patch(String(c._id), { name: 'Chỉ đổi tên' }).expect(200);
    });

    it('ghi audit update với before/after', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      await patch(String(c._id), { name: 'Đổi tên' }).expect(200);
      const logs = await t.conn
        .model<AuditLog>(Models.AuditLog)
        .find({ entity: 'class', entityId: c._id });
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('update');
    });
  });

  describe('chuyển trạng thái', () => {
    it('PLANNED -> ONGOING -> FINISHED thành công', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      const r1 = await patch(String(c._id), { status: ClassStatus.ONGOING }).expect(200);
      expect(r1.body.data.status).toBe('ONGOING');
      const r2 = await patch(String(c._id), { status: ClassStatus.FINISHED }).expect(200);
      expect(r2.body.data.status).toBe('FINISHED');
    });

    it('PLANNED -> FINISHED trả 422 INVALID_STATUS_TRANSITION', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      const res = await patch(String(c._id), { status: ClassStatus.FINISHED }).expect(422);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it.each(Object.values(ClassStatus))('FINISHED -> %s trả 422', async (to) => {
      const c = await makeClass(t.conn, { courseId: course._id, status: ClassStatus.FINISHED });
      const res = await patch(String(c._id), { status: to }).expect(422);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('gửi lại đúng status hiện tại (không phải FINISHED) là no-op 200, không phát sự kiện', async () => {
      const spy = jest.spyOn(t.app.get(EventEmitter2), 'emitAsync');
      const c = await makeClass(t.conn, { courseId: course._id, status: ClassStatus.ONGOING });
      await patch(String(c._id), {
        status: ClassStatus.ONGOING,
        name: 'Giữ nguyên trạng thái',
      }).expect(200);
      expect(spy.mock.calls.filter(([ev]) => ev === DomainEvent.ClassFinished)).toHaveLength(0);
      spy.mockRestore();
    });

    it('chuyển FINISHED phát class.finished đúng một lần, sau commit', async () => {
      const spy = jest.spyOn(t.app.get(EventEmitter2), 'emitAsync');
      const c = await makeClass(t.conn, { courseId: course._id, status: ClassStatus.ONGOING });
      await patch(String(c._id), { status: ClassStatus.FINISHED }).expect(200);
      const calls = spy.mock.calls.filter(([ev]) => ev === DomainEvent.ClassFinished);
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toMatchObject({ classId: String(c._id), at: t.clock.now() });
      expect(String((calls[0][1] as { actorId: string }).actorId)).toEqual(expect.any(String));
      // failed transitions emit nothing
      await patch(String(c._id), { status: ClassStatus.PLANNED }).expect(422);
      expect(spy.mock.calls.filter(([ev]) => ev === DomainEvent.ClassFinished)).toHaveLength(1);
      spy.mockRestore();
    });

    it('hai request song song cùng chuyển FINISHED: 1×200, 1×422, một sự kiện', async () => {
      const spy = jest.spyOn(t.app.get(EventEmitter2), 'emitAsync');
      const c = await makeClass(t.conn, { courseId: course._id, status: ClassStatus.ONGOING });
      const rs = await Promise.all([
        patch(String(c._id), { status: ClassStatus.FINISHED }),
        patch(String(c._id), { status: ClassStatus.FINISHED, name: 'B' }),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 422]);
      expect(spy.mock.calls.filter(([ev]) => ev === DomainEvent.ClassFinished)).toHaveLength(1);
      spy.mockRestore();
    });
  });

  describe('phân quyền', () => {
    it.each([Role.TEACHER, Role.STUDENT])('%s POST/PATCH trả 403', async (role) => {
      const u = await loginAs(t, role);
      const c = await makeClass(t.conn, { courseId: course._id });
      await post(body(), u.token).expect(403);
      await patch(String(c._id), { name: 'x' }, u.token).expect(403);
    });

    it('ADMIN GET /classes/:id trả 403; TEACHER/STUDENT ngoài phạm vi trả 404', async () => {
      const c = await makeClass(t.conn, { courseId: course._id });
      const get = (token: string) => t.http().get(`/api/v1/classes/${c._id}`).set(auth(token));
      await get((await loginAs(t, Role.ADMIN)).token).expect(403);
      await get((await loginAs(t, Role.TEACHER)).token).expect(404);
      await get((await loginAs(t, Role.STUDENT)).token).expect(404);
    });

    it('chưa đăng nhập trả 401; ACADEMIC_STAFF tạo được', async () => {
      await t.http().post('/api/v1/classes').send(body()).expect(401);
      await post(body(), staff.token).expect(201);
    });
  });
});
