import { Types } from 'mongoose';
import { ClassStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { INVOICE_CREATOR } from '../../src/common/contracts/invoice-creator';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeClass, makeCourse, makeEnrollment, makeStudent, models } from '../factories';

describe('FR-CLS-06 Xếp lớp', () => {
  let t: TestApp;
  let manager: string;
  let managerId: string;
  let staff: string;
  let admin: string;
  let teacher: string;
  let student: string;
  const invoiceId = new Types.ObjectId();
  const fake = { createForEnrollment: jest.fn().mockResolvedValue(invoiceId), voidForEnrollment: jest.fn() };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const assign = (token: string, id: string | Types.ObjectId, body: object) =>
    t.http().post(`/api/v1/enrollments/${id}/assign`).set(auth(token)).send(body);

  async function waiting(courseId: Types.ObjectId, level = 'A1', withUser = false) {
    const st = await makeStudent(t.conn, { withUser });
    return makeEnrollment(t.conn, { studentId: st._id, courseId, status: EnrollmentStatus.WAITING_CLASS, placementLevel: level });
  }

  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: INVOICE_CREATOR, useValue: fake }] });
    const mgr = await loginAs(t, Role.MANAGER);
    manager = mgr.token;
    managerId = mgr.user._id.toString();
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    admin = (await loginAs(t, Role.ADMIN)).token;
    teacher = (await loginAs(t, Role.TEACHER)).token;
    student = (await loginAs(t, Role.STUDENT)).token;
    t.app.getHttpServer().setMaxListeners(50); // 10 parallel supertest requests
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => fake.createForEnrollment.mockClear());

  it('enrollment PENDING_PLACEMENT → 422 ENROLLMENT_INVALID_STATE', async () => {
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: c._id });
    const e = await makeEnrollment(t.conn, { courseId: c._id });
    const res = await assign(staff, e._id, { classId: cls._id.toString() }).expect(422);
    expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
  });

  it('lớp khác khóa → 422 COURSE_MISMATCH', async () => {
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn);
    const e = await waiting(c._id);
    const res = await assign(staff, e._id, { classId: cls._id.toString() }).expect(422);
    expect(res.body.error.code).toBe(ErrorCode.COURSE_MISMATCH);
  });

  it('lệch level không lý do → 422 LEVEL_MISMATCH; lý do < 5 ký tự → 400; có lý do → 201 + levelOverride', async () => {
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: c._id, level: 'B1' });
    const e = await waiting(c._id, 'A1');
    const r1 = await assign(manager, e._id, { classId: cls._id.toString() }).expect(422);
    expect(r1.body.error.code).toBe(ErrorCode.LEVEL_MISMATCH);
    await assign(manager, e._id, { classId: cls._id.toString(), overrideReason: 'abc' }).expect(400);
    const r2 = await assign(manager, e._id, { classId: cls._id.toString(), overrideReason: 'HV xin học vượt' }).expect(201);
    expect(r2.body.data.levelOverride).toMatchObject({ reason: 'HV xin học vượt' });
    expect(r2.body.data.levelOverride.by).toBe(managerId);
    expect(r2.body.data.levelOverride.at).toBeTruthy();
  });

  it('lớp FINISHED / INACTIVE → 422 CLASS_NOT_OPEN', async () => {
    const c = await makeCourse(t.conn);
    for (const status of [ClassStatus.FINISHED, ClassStatus.INACTIVE]) {
      const cls = await makeClass(t.conn, { courseId: c._id, status });
      const e = await waiting(c._id);
      const res = await assign(staff, e._id, { classId: cls._id.toString() }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.CLASS_NOT_OPEN);
    }
  });

  it('lớp đầy → 422 CLASS_FULL; lớp không tồn tại → 404; enrollment không tồn tại → 404', async () => {
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: c._id, maxCapacity: 1, currentSize: 1 });
    const e = await waiting(c._id);
    const res = await assign(staff, e._id, { classId: cls._id.toString() }).expect(422);
    expect(res.body.error.code).toBe(ErrorCode.CLASS_FULL);
    await assign(staff, e._id, { classId: new Types.ObjectId().toString() }).expect(404);
    await assign(staff, new Types.ObjectId(), { classId: cls._id.toString() }).expect(404);
    await assign(staff, 'zzz', { classId: cls._id.toString() }).expect(404);
  });

  it('thành công → ENROLLED, sĩ số +1, hóa đơn, thông báo, lock counter, audit', async () => {
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: c._id });
    const e = await waiting(c._id, 'A1', true);
    const res = await assign(staff, e._id, { classId: cls._id.toString() }).expect(201);
    expect(res.body.data).toMatchObject({ status: EnrollmentStatus.ENROLLED, classId: cls._id.toString() });
    expect(res.body.data.enrolledAt).toBeTruthy();
    const m = models(t.conn);
    const row = await m.Enrollment.findById(e._id).lean();
    expect(row?.invoiceId?.toString()).toBe(invoiceId.toString());
    expect(row?.history.at(-1)).toMatchObject({ from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED });
    expect((await m.Class.findById(cls._id).lean())?.currentSize).toBe(1);
    expect(fake.createForEnrollment).toHaveBeenCalledTimes(1);
    expect(fake.createForEnrollment.mock.calls[0][0].toString()).toBe(e._id.toString());
    expect(typeof fake.createForEnrollment.mock.calls[0][1].commitTransaction).toBe('function'); // a ClientSession
    const st = await m.Student.findById(e.studentId).lean();
    const n = await t.conn.collection('notifications').find({ type: 'CLASS_ASSIGNED', userId: st?.userId }).toArray();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ refType: 'CLASS' });
    expect(n[0].refId?.toString()).toBe(cls._id.toString());
    expect(await t.conn.collection('counters').findOne({ _id: `lock:class:${cls._id}` as never })).toBeTruthy();
    expect(await t.conn.collection('audit_logs').countDocuments({ entity: 'enrollment', entityId: e._id })).toBeGreaterThan(0);
  });

  it('10 request song song (10 enrollment) vào lớp còn 1 chỗ → đúng 1×201, 9×422 CLASS_FULL', async () => {
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: c._id, maxCapacity: 3, currentSize: 2 });
    const es = await Promise.all(Array.from({ length: 10 }, () => waiting(c._id)));
    const rs = await Promise.all(es.map((e) => assign(staff, e._id, { classId: cls._id.toString() })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    const bad = rs.filter((r) => r.status === 422);
    expect(bad).toHaveLength(9);
    expect(bad.every((r) => r.body.error.code === ErrorCode.CLASS_FULL)).toBe(true);
    expect((await models(t.conn).Class.findById(cls._id).lean())?.currentSize).toBe(3);
  });

  it('2 request song song cùng enrollment → 1×201, 1×422', async () => {
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: c._id });
    const e = await waiting(c._id);
    const rs = await Promise.all([0, 1].map(() => assign(staff, e._id, { classId: cls._id.toString() })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(rs.find((r) => r.status === 422)?.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
    expect((await models(t.conn).Class.findById(cls._id).lean())?.currentSize).toBe(1);
  });

  it('T, H, A → 403', async () => {
    const id = new Types.ObjectId();
    for (const tok of [teacher, student, admin]) await assign(tok, id, { classId: new Types.ObjectId().toString() }).expect(403);
  });
});
