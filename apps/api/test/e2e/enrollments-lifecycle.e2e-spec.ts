import { Types } from 'mongoose';
import { ClassStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { INVOICE_CREATOR } from '../../src/common/contracts/invoice-creator';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeClass, makeCourse, makeEnrollment, makeStudent, models } from '../factories';

describe('FR-CLS-07..11 Vòng đời enrollment', () => {
  let t: TestApp;
  let manager: string;
  let managerId: string;
  let staff: string;
  let admin: string;
  let teacher: string;
  let studentTok: string;
  const invoiceId = new Types.ObjectId();
  const fake = { createForEnrollment: jest.fn().mockResolvedValue(invoiceId), voidForEnrollment: jest.fn() };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (token: string, id: string | Types.ObjectId, action: string, body: object = {}) =>
    t.http().post(`/api/v1/enrollments/${id}/${action}`).set(auth(token)).send(body);
  const m = () => models(t.conn);
  const size = async (id: Types.ObjectId) => (await m().Class.findById(id).lean())?.currentSize;

  async function enrolled(courseId: Types.ObjectId, classId: Types.ObjectId, extra: object = {}) {
    const st = await makeStudent(t.conn, { withUser: true });
    return makeEnrollment(t.conn, { studentId: st._id, courseId, classId, status: EnrollmentStatus.ENROLLED, ...extra });
  }

  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: INVOICE_CREATOR, useValue: fake }] });
    const mgr = await loginAs(t, Role.MANAGER);
    manager = mgr.token;
    managerId = mgr.user._id.toString();
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    admin = (await loginAs(t, Role.ADMIN)).token;
    teacher = (await loginAs(t, Role.TEACHER)).token;
    studentTok = (await loginAs(t, Role.STUDENT)).token;
    t.app.getHttpServer().setMaxListeners(50);
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(() => {
    fake.createForEnrollment.mockClear();
    fake.voidForEnrollment.mockClear();
  });

  describe('chuyển trạng thái sai', () => {
    it('withdraw COMPLETED → 422 INVALID_STATUS_TRANSITION', async () => {
      const e = await makeEnrollment(t.conn, { status: EnrollmentStatus.COMPLETED });
      const res = await post(staff, e._id, 'withdraw', { status: 'CANCELLED', reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    });
    it('resume ENROLLED → 422 INVALID_STATUS_TRANSITION', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 1 });
      const e = await enrolled(c._id, cls._id);
      const res = await post(staff, e._id, 'resume').expect(422);
      expect(res.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    });
    it('transfer WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id });
      const e = await makeEnrollment(t.conn, { courseId: c._id, status: EnrollmentStatus.WAITING_CLASS });
      const res = await post(staff, e._id, 'transfer', { toClassId: cls._id.toString(), reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
    });
  });

  describe('withdraw', () => {
    it('CANCELLED từ ENROLLED → void gọi 1 lần (id, reason), currentSize −1', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 3 });
      const e = await enrolled(c._id, cls._id, { invoiceId });
      const res = await post(manager, e._id, 'withdraw', { status: 'CANCELLED', reason: 'Nghỉ học' }).expect(201);
      expect(res.body.data.status).toBe(EnrollmentStatus.CANCELLED);
      expect(fake.voidForEnrollment).toHaveBeenCalledTimes(1);
      expect(fake.voidForEnrollment.mock.calls[0][0].toString()).toBe(e._id.toString());
      expect(fake.voidForEnrollment.mock.calls[0][1]).toBe('Nghỉ học');
      expect(await size(cls._id)).toBe(2);
      const row = await m().Enrollment.findById(e._id).lean();
      expect(row?.history.at(-1)).toMatchObject({ from: 'ENROLLED', to: 'CANCELLED', reason: 'Nghỉ học' });
    });
    it('RESERVED → không gọi void, currentSize −1', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 3 });
      const e = await enrolled(c._id, cls._id);
      const res = await post(staff, e._id, 'withdraw', { status: 'RESERVED', reason: 'Bận' }).expect(201);
      expect(res.body.data.status).toBe(EnrollmentStatus.RESERVED);
      expect(fake.voidForEnrollment).not.toHaveBeenCalled();
      expect(await size(cls._id)).toBe(2);
    });
    it('CANCELLED từ WAITING_CLASS → không đổi sĩ số, không void', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 3 });
      const e = await makeEnrollment(t.conn, { courseId: c._id, status: EnrollmentStatus.WAITING_CLASS });
      await post(staff, e._id, 'withdraw', { status: 'CANCELLED', reason: 'Hủy' }).expect(201);
      expect(await size(cls._id)).toBe(3);
      expect(fake.voidForEnrollment).not.toHaveBeenCalled();
    });
    it('R18: RESERVED (có invoiceId) → CANCELLED gọi void 1 lần, sĩ số không đổi', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 3 });
      const e = await makeEnrollment(t.conn, { courseId: c._id, classId: cls._id, status: EnrollmentStatus.RESERVED, invoiceId });
      await post(staff, e._id, 'withdraw', { status: 'CANCELLED', reason: 'Bỏ hẳn' }).expect(201);
      expect(fake.voidForEnrollment).toHaveBeenCalledTimes(1);
      expect(fake.voidForEnrollment.mock.calls[0][1]).toBe('Bỏ hẳn');
      expect(await size(cls._id)).toBe(3);
    });
    it('R18: WAITING_CLASS sau resume (có invoiceId) → CANCELLED gọi void 1 lần', async () => {
      const e = await makeEnrollment(t.conn, { status: EnrollmentStatus.WAITING_CLASS, invoiceId });
      await post(staff, e._id, 'withdraw', { status: 'CANCELLED', reason: 'Hủy' }).expect(201);
      expect(fake.voidForEnrollment).toHaveBeenCalledTimes(1);
    });
    it('R18: PENDING_PLACEMENT → CANCELLED (không invoiceId) → không void, không đổi sĩ số', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 3 });
      const e = await makeEnrollment(t.conn, { courseId: c._id });
      await post(staff, e._id, 'withdraw', { status: 'CANCELLED', reason: 'Hủy' }).expect(201);
      expect(fake.voidForEnrollment).not.toHaveBeenCalled();
      expect(await size(cls._id)).toBe(3);
    });
    it('PENDING_PLACEMENT → RESERVED → 422 INVALID_STATUS_TRANSITION', async () => {
      const e = await makeEnrollment(t.conn);
      const res = await post(staff, e._id, 'withdraw', { status: 'RESERVED', reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    });
    it('RESERVED từ WAITING_CLASS → 422 INVALID_STATUS_TRANSITION', async () => {
      const e = await makeEnrollment(t.conn, { status: EnrollmentStatus.WAITING_CLASS });
      const res = await post(staff, e._id, 'withdraw', { status: 'RESERVED', reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    });
    it('lý do rỗng → 400 REASON_REQUIRED', async () => {
      const e = await makeEnrollment(t.conn, { status: EnrollmentStatus.WAITING_CLASS });
      const res = await post(staff, e._id, 'withdraw', { status: 'CANCELLED', reason: '   ' }).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.REASON_REQUIRED);
    });
    it('không tồn tại / id hỏng → 404', async () => {
      await post(staff, new Types.ObjectId(), 'withdraw', { status: 'CANCELLED', reason: 'x' }).expect(404);
      await post(staff, 'zzz', 'withdraw', { status: 'CANCELLED', reason: 'x' }).expect(404);
    });
  });

  describe('resume', () => {
    it('RESERVED → WAITING_CLASS, classId null, waitingSince mới; assign lại gọi createForEnrollment, invoiceId giữ', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 1 });
      const e = await enrolled(c._id, cls._id, { invoiceId });
      await post(staff, e._id, 'withdraw', { status: 'RESERVED', reason: 'Bận' }).expect(201);
      t.clock.set(new Date('2026-01-05T02:05:00Z'));
      const res = await post(staff, e._id, 'resume').expect(201);
      t.clock.set(new Date('2026-01-05T02:00:00Z'));
      expect(res.body.data).toMatchObject({ status: EnrollmentStatus.WAITING_CLASS, classId: null, waitingSince: '2026-01-05T02:05:00.000Z' });
      const target = await makeClass(t.conn, { courseId: c._id });
      await post(staff, e._id, 'assign', { classId: target._id.toString() }).expect(201);
      expect(fake.createForEnrollment).toHaveBeenCalledTimes(1);
      const row = await m().Enrollment.findById(e._id).lean();
      expect(row?.invoiceId?.toString()).toBe(invoiceId.toString());
      expect(await m().Enrollment.countDocuments({ studentId: e.studentId, courseId: c._id })).toBe(1);
    });
    it('resume enrollment không tồn tại → 404', async () => {
      await post(staff, new Types.ObjectId(), 'resume').expect(404);
    });
  });

  describe('class.finished', () => {
    it('PATCH FINISHED → ENROLLED → COMPLETED, TRANSFERRED giữ nguyên, currentSize giữ nguyên', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 2, status: ClassStatus.ONGOING });
      const e1 = await enrolled(c._id, cls._id);
      const e2 = await enrolled(c._id, cls._id);
      const e3 = await enrolled(c._id, cls._id, { status: EnrollmentStatus.TRANSFERRED });
      await t.http().patch(`/api/v1/classes/${cls._id}`).set(auth(manager)).send({ status: 'FINISHED' }).expect(200);
      const rows = await m().Enrollment.find({ _id: { $in: [e1._id, e2._id, e3._id] } }).lean();
      const by = new Map(rows.map((r) => [r._id.toString(), r]));
      expect(by.get(e1._id.toString())?.status).toBe(EnrollmentStatus.COMPLETED);
      expect(by.get(e2._id.toString())?.status).toBe(EnrollmentStatus.COMPLETED);
      expect(by.get(e3._id.toString())?.status).toBe(EnrollmentStatus.TRANSFERRED);
      expect(by.get(e1._id.toString())?.history.at(-1)).toMatchObject({ from: 'ENROLLED', to: 'COMPLETED' });
      expect(by.get(e1._id.toString())?.history.at(-1)?.by?.toString()).toBe(managerId);
      expect(await size(cls._id)).toBe(2);
    });
  });

  describe('transfer', () => {
    it('cũ TRANSFERRED + transferredToId, mới ENROLLED + transferredFromId + invoiceId cũ, sĩ số, không gọi InvoiceCreator, CLASS_ASSIGNED', async () => {
      const c = await makeCourse(t.conn);
      const from = await makeClass(t.conn, { courseId: c._id, currentSize: 5 });
      const to = await makeClass(t.conn, { courseId: c._id, currentSize: 2 });
      const e = await enrolled(c._id, from._id, { invoiceId });
      const res = await post(staff, e._id, 'transfer', { toClassId: to._id.toString(), reason: 'Đổi lịch' }).expect(201);
      const dto = res.body.data;
      expect(dto).toMatchObject({ status: EnrollmentStatus.ENROLLED, classId: to._id.toString(), transferredFromId: e._id.toString(), invoiceId: invoiceId.toString() });
      expect(dto.id).not.toBe(e._id.toString());
      const old = await m().Enrollment.findById(e._id).lean();
      expect(old?.status).toBe(EnrollmentStatus.TRANSFERRED);
      expect(old?.transferredToId?.toString()).toBe(dto.id);
      expect(old?.history.at(-1)).toMatchObject({ from: 'ENROLLED', to: 'TRANSFERRED', reason: 'Đổi lịch' });
      expect(await size(from._id)).toBe(4);
      expect(await size(to._id)).toBe(3);
      expect(fake.createForEnrollment).not.toHaveBeenCalled();
      const st = await m().Student.findById(e.studentId).lean();
      const n = await t.conn.collection('notifications').find({ type: 'CLASS_ASSIGNED', userId: st?.userId }).toArray();
      expect(n).toHaveLength(1);
      expect(n[0].refId?.toString()).toBe(to._id.toString());
    });
    it('lớp đích đầy → 422 CLASS_FULL, không đổi gì', async () => {
      const c = await makeCourse(t.conn);
      const from = await makeClass(t.conn, { courseId: c._id, currentSize: 5 });
      const to = await makeClass(t.conn, { courseId: c._id, maxCapacity: 2, currentSize: 2 });
      const e = await enrolled(c._id, from._id);
      const res = await post(staff, e._id, 'transfer', { toClassId: to._id.toString(), reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.CLASS_FULL);
      expect((await m().Enrollment.findById(e._id).lean())?.status).toBe(EnrollmentStatus.ENROLLED);
      expect(await size(from._id)).toBe(5);
      expect(await size(to._id)).toBe(2);
      expect(await m().Enrollment.countDocuments({ studentId: e.studentId })).toBe(1);
    });
    it('lớp đích khác khóa → 422 COURSE_MISMATCH', async () => {
      const c = await makeCourse(t.conn);
      const from = await makeClass(t.conn, { courseId: c._id, currentSize: 1 });
      const to = await makeClass(t.conn);
      const e = await enrolled(c._id, from._id);
      const res = await post(staff, e._id, 'transfer', { toClassId: to._id.toString(), reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.COURSE_MISMATCH);
    });
    it('lớp đích không mở → 422 CLASS_NOT_OPEN', async () => {
      const c = await makeCourse(t.conn);
      const from = await makeClass(t.conn, { courseId: c._id, currentSize: 1 });
      const to = await makeClass(t.conn, { courseId: c._id, status: ClassStatus.FINISHED });
      const e = await enrolled(c._id, from._id);
      const res = await post(staff, e._id, 'transfer', { toClassId: to._id.toString(), reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.CLASS_NOT_OPEN);
    });
    it('chuyển vào chính lớp đang học → 400 VALIDATION_FAILED fields.toClassId', async () => {
      const c = await makeCourse(t.conn);
      const from = await makeClass(t.conn, { courseId: c._id, currentSize: 1 });
      const e = await enrolled(c._id, from._id);
      const res = await post(staff, e._id, 'transfer', { toClassId: from._id.toString(), reason: 'x' }).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(res.body.error.details.fields.toClassId).toBeTruthy();
    });
    it('2 transfer song song (2 HV) vào lớp đích còn 1 chỗ → 1×201, 1×422 CLASS_FULL, nguồn chỉ −1', async () => {
      const c = await makeCourse(t.conn);
      const from = await makeClass(t.conn, { courseId: c._id, currentSize: 2 });
      const to = await makeClass(t.conn, { courseId: c._id, maxCapacity: 3, currentSize: 2 });
      const es = [await enrolled(c._id, from._id), await enrolled(c._id, from._id)];
      const rs = await Promise.all(es.map((e) => post(staff, e._id, 'transfer', { toClassId: to._id.toString(), reason: 'x' })));
      expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(rs.find((r) => r.status === 422)?.body.error.code).toBe(ErrorCode.CLASS_FULL);
      expect(await size(from._id)).toBe(1);
      expect(await size(to._id)).toBe(3);
    });
    it('lý do rỗng → 400', async () => {
      const c = await makeCourse(t.conn);
      const from = await makeClass(t.conn, { courseId: c._id, currentSize: 1 });
      const to = await makeClass(t.conn, { courseId: c._id });
      const e = await enrolled(c._id, from._id);
      const res = await post(staff, e._id, 'transfer', { toClassId: to._id.toString(), reason: ' ' }).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.REASON_REQUIRED);
    });
  });

  describe('confirm', () => {
    it('HV confirm của mình → confirmedAt; người khác → 404; không ENROLLED → 422', async () => {
      const c = await makeCourse(t.conn);
      const cls = await makeClass(t.conn, { courseId: c._id, currentSize: 1 });
      const st = await makeStudent(t.conn);
      const e = await makeEnrollment(t.conn, { studentId: st._id, courseId: c._id, classId: cls._id, status: EnrollmentStatus.ENROLLED });
      const mine = (await loginAs(t, Role.STUDENT, { studentId: st._id })).token;
      await post(studentTok, e._id, 'confirm').expect(404);
      const res = await post(mine, e._id, 'confirm').expect(201);
      expect(res.body.data.confirmedAt).toBe('2026-01-05T02:00:00.000Z');
      const w = await makeEnrollment(t.conn, { studentId: st._id, status: EnrollmentStatus.WAITING_CLASS });
      t.clock.set(new Date('2026-01-05T02:05:00Z'));
      const again = await post(mine, e._id, 'confirm').expect(201);
      t.clock.set(new Date('2026-01-05T02:00:00Z'));
      expect(again.body.data.confirmedAt).toBe('2026-01-05T02:00:00.000Z');
      const r2 = await post(mine, w._id, 'confirm').expect(422);
      expect(r2.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
    });
    it('M/S/T/A confirm → 403', async () => {
      const e = await makeEnrollment(t.conn, { status: EnrollmentStatus.ENROLLED });
      for (const tok of [manager, staff, teacher, admin]) await post(tok, e._id, 'confirm').expect(403);
    });
  });

  describe('quyền', () => {
    it('transfer/withdraw/resume: T, H, A → 403', async () => {
      const e = await makeEnrollment(t.conn, { status: EnrollmentStatus.ENROLLED });
      const bodies: Array<[string, object]> = [
        ['transfer', { toClassId: new Types.ObjectId().toString(), reason: 'x' }],
        ['withdraw', { status: 'CANCELLED', reason: 'x' }],
        ['resume', {}],
      ];
      for (const tok of [teacher, studentTok, admin]) for (const [a, b] of bodies) await post(tok, e._id, a, b).expect(403);
    });
  });
});
