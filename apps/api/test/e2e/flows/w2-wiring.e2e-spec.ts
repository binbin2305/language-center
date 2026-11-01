import { Types } from 'mongoose';
import { AttendanceStatus, EnrollmentStatus, ErrorCode, InvoiceKind, InvoiceStatus, PaymentMethod, Role } from '@lc/shared';
import { loginAs } from '../../helpers/auth';
import { createTestApp, TestApp } from '../../helpers/test-app';
import { DEFAULT_PASSWORD } from '../../factories/user.factory';
import {
  makeClass,
  makeCourse,
  makeEnrollment,
  makeRoom,
  makeSession,
  makeStudent,
  models,
} from '../../factories';

/** Task M (W2): real FeesModule / AttendanceModule wired into enrollments, grades and classes — no fakes. */
describe('W2 nối dây: enrollments ↔ fees ↔ grades ↔ attendance (FR-CLS-08 FR-CLS-09 FR-CLS-10, FR-FEE-01, FR-GRD-07, FR-ATT-05)', () => {
  let t: TestApp;
  let manager: string;
  let staff: string;
  let teacher: { token: string; id: Types.ObjectId };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (p: string) => `/api/v1${p}`;
  const m = () => models(t.conn);
  const act = (id: Types.ObjectId | string, action: string, body: object = {}) =>
    t.http().post(api(`/enrollments/${id}/${action}`)).set(auth(staff)).send(body);
  const tuition = (studentId: Types.ObjectId) =>
    m().Invoice.find({ studentId, kind: InvoiceKind.TUITION }).lean();

  async function waiting(courseId: Types.ObjectId, level = 'A1') {
    const st = await makeStudent(t.conn, { withUser: true });
    const e = await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId,
      status: EnrollmentStatus.WAITING_CLASS,
      placementLevel: level,
      waitingSince: t.clock.now(),
    });
    return { st, e };
  }

  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    const tch = await loginAs(t, Role.TEACHER);
    teacher = { token: tch.token, id: tch.user._id };
  });
  afterAll(async () => {
    await t.close();
  });

  it('(1) FR-PLT-03 + FR-PLT-04 + FR-FEE-01: placement → WAITING_CLASS → assign → đúng 1 hóa đơn TUITION HD2026…, enrollment.invoiceId = id đó', async () => {
    const course = await makeCourse(t.conn, { baseFee: 2_000_000 });
    const room = await makeRoom(t.conn);
    const st = await makeStudent(t.conn, { withUser: true });
    const e = await makeEnrollment(t.conn, { studentId: st._id, courseId: course._id });
    const pt = await t
      .http()
      .post(api('/placement-tests'))
      .set(auth(staff))
      .send({
        courseId: course._id.toString(),
        roomId: room._id.toString(),
        teacherId: teacher.id.toString(),
        startAt: '2026-01-10T02:00:00.000Z',
        endAt: '2026-01-10T04:00:00.000Z',
      })
      .expect(201);
    const ptId = pt.body.data.id as string;
    await t
      .http()
      .post(api(`/placement-tests/${ptId}/candidates`))
      .set(auth(staff))
      .send({ enrollmentIds: [e._id.toString()] })
      .expect((r) => expect([200, 201]).toContain(r.status));
    await t
      .http()
      .put(api(`/placement-tests/${ptId}/results`))
      .set(auth(teacher.token))
      .send([{ enrollmentId: e._id.toString(), score: 7.5, level: 'A2' }])
      .expect(200);
    expect((await m().Enrollment.findById(e._id).lean())?.status).toBe(EnrollmentStatus.WAITING_CLASS);

    const cls = await makeClass(t.conn, { courseId: course._id, level: 'A2' });
    await act(e._id, 'assign', { classId: cls._id.toString() }).expect(201);

    const invoices = await tuition(st._id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].code).toMatch(/^HD2026\d+$/);
    expect(invoices[0].amountDue).toBe(2_000_000);
    const after = await m().Enrollment.findById(e._id).lean();
    expect(after?.status).toBe(EnrollmentStatus.ENROLLED);
    expect(after?.invoiceId?.toString()).toBe(invoices[0]._id.toString());
  });

  it('(2) FR-CLS-10: bảo lưu → học lại → xếp lớp lại → vẫn đúng 1 hóa đơn, invoiceId giữ nguyên', async () => {
    const course = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: course._id });
    const { st, e } = await waiting(course._id);
    await act(e._id, 'assign', { classId: cls._id.toString() }).expect(201);
    const first = (await m().Enrollment.findById(e._id).lean())?.invoiceId?.toString();
    expect(first).toBeDefined();

    await act(e._id, 'withdraw', { status: EnrollmentStatus.RESERVED, reason: 'Bảo lưu vì công tác' }).expect(201);
    await act(e._id, 'resume').expect(201);
    const cls2 = await makeClass(t.conn, { courseId: course._id });
    await act(e._id, 'assign', { classId: cls2._id.toString() }).expect(201);

    const invoices = await tuition(st._id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].status).not.toBe(InvoiceStatus.VOID);
    expect((await m().Enrollment.findById(e._id).lean())?.invoiceId?.toString()).toBe(first);
  });

  it('(3) FR-CLS-08: chuyển lớp → không hóa đơn mới, enrollment mới cùng invoiceId, invoice.classId giữ lớp gốc', async () => {
    const course = await makeCourse(t.conn);
    const from = await makeClass(t.conn, { courseId: course._id });
    const to = await makeClass(t.conn, { courseId: course._id });
    const { st, e } = await waiting(course._id);
    await act(e._id, 'assign', { classId: from._id.toString() }).expect(201);
    const invoiceId = (await m().Enrollment.findById(e._id).lean())?.invoiceId?.toString();
    expect(invoiceId).toBeDefined();

    await act(e._id, 'transfer', { toClassId: to._id.toString(), reason: 'Đổi giờ học' }).expect(201);

    const invoices = await tuition(st._id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].classId?.toString()).toBe(from._id.toString());
    const fresh = await m().Enrollment.findOne({ studentId: st._id, classId: to._id }).lean();
    expect(fresh?.status).toBe(EnrollmentStatus.ENROLLED);
    expect(fresh?.transferredFromId?.toString()).toBe(e._id.toString());
    expect(fresh?.invoiceId?.toString()).toBe(invoiceId);
  });

  it('(4) FR-CLS-09 + FR-FEE-01: rút CANCELLED khi chưa đóng → hóa đơn VOID; đã đóng một phần → giữ', async () => {
    const course = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: course._id });
    const a = await waiting(course._id);
    await act(a.e._id, 'assign', { classId: cls._id.toString() }).expect(201);
    await act(a.e._id, 'withdraw', { status: EnrollmentStatus.CANCELLED, reason: 'Nghỉ học hẳn' }).expect(201);
    const [voided] = await tuition(a.st._id);
    expect(voided.status).toBe(InvoiceStatus.VOID);

    const b = await waiting(course._id);
    await act(b.e._id, 'assign', { classId: cls._id.toString() }).expect(201);
    const [inv] = await tuition(b.st._id);
    await t
      .http()
      .post(api(`/invoices/${inv._id}/payments`))
      .set(auth(staff))
      .send({ amount: 500_000, method: PaymentMethod.CASH })
      .expect(201);
    await act(b.e._id, 'withdraw', { status: EnrollmentStatus.CANCELLED, reason: 'Nghỉ học hẳn' }).expect(201);
    const [kept] = await tuition(b.st._id);
    expect(kept.status).not.toBe(InvoiceStatus.VOID);
    expect(kept.amountPaid).toBe(500_000);
  });

  it('(5) FR-GRD-07: resultViewRequiresPaidFees=true + hóa đơn quá hạn → H /results 403 FEES_OUTSTANDING, thanh toán đủ → 200', async () => {
    await t.http().patch(api('/settings')).set(auth(manager)).send({ resultViewRequiresPaidFees: true }).expect(200);
    try {
      const course = await makeCourse(t.conn, { baseFee: 1_000_000 });
      const cls = await makeClass(t.conn, { courseId: course._id, startDate: new Date('2025-11-03T00:00:00+07:00') });
      const { st, e } = await waiting(course._id);
      await act(e._id, 'assign', { classId: cls._id.toString() }).expect(201);
      // R23 makes a late assignment due today + N; age the invoice so it is overdue.
      await m().Invoice.updateMany({ studentId: st._id, kind: InvoiceKind.TUITION }, { $set: { dueDate: new Date('2025-12-01T00:00:00+07:00') } });
      const login = await t.http().post(api('/auth/login')).send({ username: st.code, password: DEFAULT_PASSWORD }).expect(200);
      const me = login.body.data.accessToken as string;

      const blocked = await t.http().get(api('/results')).set(auth(me));
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe(ErrorCode.FEES_OUTSTANDING);

      const [inv] = await tuition(st._id);
      await t
        .http()
        .post(api(`/invoices/${inv._id}/payments`))
        .set(auth(staff))
        .send({ amount: inv.amountDue, method: PaymentMethod.BANK_TRANSFER })
        .expect(201);
      expect((await m().Invoice.findById(inv._id).lean())?.status).toBe(InvoiceStatus.PAID);
      await t.http().get(api('/results')).set(auth(me)).expect(200);
    } finally {
      await t.http().patch(api('/settings')).set(auth(manager)).send({ resultViewRequiresPaidFees: false }).expect(200);
    }
  });

  it('(6) FR-ATT-05: điểm danh vượt ngưỡng → /classes/:id/students có warning: true (warningFlags)', async () => {
    // Pin the threshold so the case does not depend on the settings default.
    await t.http().patch(api('/settings')).set(auth(manager)).send({ attendanceWarningThreshold: 0.2 }).expect(200);
    const course = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: course._id, teacherId: teacher.id });
    const absent = await waiting(course._id);
    const present = await waiting(course._id);
    await act(absent.e._id, 'assign', { classId: cls._id.toString() }).expect(201);
    await act(present.e._id, 'assign', { classId: cls._id.toString() }).expect(201);
    const startAt = new Date(t.clock.now().getTime() + 10 * 60_000);
    const session = await makeSession(t.conn, {
      classId: cls._id,
      teacherId: teacher.id,
      startAt,
      endAt: new Date(startAt.getTime() + 90 * 60_000),
    });
    await t
      .http()
      .put(api(`/sessions/${session._id}/attendance`))
      .set(auth(teacher.token))
      .send({
        records: [
          { studentId: absent.st._id.toString(), status: AttendanceStatus.UNEXCUSED },
          { studentId: present.st._id.toString(), status: AttendanceStatus.PRESENT },
        ],
      })
      .expect(200);

    const res = await t.http().get(api(`/classes/${cls._id}/students`)).set(auth(staff)).expect(200);
    const row = (id: Types.ObjectId) =>
      (res.body.data as Array<{ studentId: string; warning: boolean; absenceRate: number }>).find((r) => r.studentId === id.toString());
    expect(row(absent.st._id)).toMatchObject({ warning: true, absenceRate: 1 });
    expect(row(present.st._id)).toMatchObject({ warning: false, absenceRate: 0 });
  });
});
