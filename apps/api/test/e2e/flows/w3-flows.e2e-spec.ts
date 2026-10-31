import { Types } from 'mongoose';
import {
  AttendanceStatus,
  ClassStatus,
  EnrollmentStatus,
  ErrorCode,
  Gender,
  InvoiceKind,
  LeadStatus,
  NotificationType,
  Role,
  fromDateOnly,
} from '@lc/shared';
import { loginAs } from '../../helpers/auth';
import { createTestApp, TestApp } from '../../helpers/test-app';
import { DEFAULT_PASSWORD } from '../../factories/user.factory';
import { makeAssessment, makeClass, makeCourse, makeRoom, makeSession, makeStudent, makeEnrollment, models } from '../../factories';

/*
 * TASK W3-L2 — cross-module flows, driven over HTTP (factories only for users/courses/rooms/classes/sessions).
 * Cases already covered elsewhere (not duplicated here):
 *   (2) assign with failing InvoiceCreator -> rollback ........ test/e2e/enrollments-assign-rollback.e2e-spec.ts
 *   (3) transfer -> no new invoice; old-class attendance kept .. flows/w2-wiring (3) + flows/w2-history-scope (chuyển lớp, /attendance)
 *   (5) absence over threshold -> flag in class list ........... flows/w2-wiring (6)
 *   (6) resultViewRequiresPaidFees blocks then pays ............ flows/w2-wiring (5)
 *   (7) reserve -> resume -> reassign = 1 TUITION invoice; withdraw unpaid -> VOID .. flows/w2-wiring (2), (4)
 * Added here: (1-mở rộng) lead -> convert -> placement -> assign with R23 amount/due; (4) cancelled session; (8) class finished.
 */
describe('W3 flow xuyên module (W3-L2)', () => {
  let t: TestApp;
  let staff: string;
  let manager: string;
  let teacher: { token: string; id: Types.ObjectId };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (p: string) => `/api/v1${p}`;
  const m = () => models(t.conn);
  const act = (id: Types.ObjectId | string, action: string, body: object = {}) =>
    t.http().post(api(`/enrollments/${id}/${action}`)).set(auth(staff)).send(body);
  const login = async (username: string, password: string) =>
    (await t.http().post(api('/auth/login')).send({ username, password }).expect(200)).body.data.accessToken as string;
  let phoneSeq = 0;

  beforeAll(async () => {
    t = await createTestApp();
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    manager = (await loginAs(t, Role.MANAGER)).token;
    const tch = await loginAs(t, Role.TEACHER);
    teacher = { token: tch.token, id: tch.user._id };
  });
  afterAll(async () => {
    await t.close();
  });

  /** Lead -> convert -> placement test -> assign, all over HTTP. Returns ids. */
  async function leadToAssigned(course: { _id: Types.ObjectId }, room: { _id: Types.ObjectId }, classId: Types.ObjectId) {
    const lead = await t
      .http()
      .post(api('/leads'))
      .set(auth(staff))
      .send({
        fullName: 'Nguyễn Văn Flow',
        dob: '2005-05-05',
        gender: Gender.MALE,
        phone: `091${String(5_000_000 + ++phoneSeq)}`,
        interestedCourseId: course._id.toString(),
      })
      .expect(201);
    const conv = await t.http().post(api(`/leads/${lead.body.data.id}/convert`)).set(auth(staff)).send().expect(201);
    const { student, tempPassword, enrollmentId } = conv.body.data as {
      student: { id: string; code: string };
      tempPassword: string;
      enrollmentId: string;
    };
    expect((await m().Lead.findById(lead.body.data.id).lean())?.status).toBe(LeadStatus.PROFILE_CREATED);

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
      .send({ enrollmentIds: [enrollmentId] })
      .expect((r) => expect([200, 201]).toContain(r.status));
    await t
      .http()
      .put(api(`/placement-tests/${ptId}/results`))
      .set(auth(teacher.token))
      .send([{ enrollmentId, score: 7, level: 'A1' }])
      .expect(200);
    expect((await m().Enrollment.findById(enrollmentId).lean())?.status).toBe(EnrollmentStatus.WAITING_CLASS);
    await act(enrollmentId, 'assign', { classId: classId.toString() }).expect(201);
    return { studentId: student.id, code: student.code, tempPassword, enrollmentId };
  }

  it('(1) FR-ADM-02/PLT/FEE + R23: lead → convert → placement → xếp lớp chưa bắt đầu → 1 hóa đơn đúng amount, hạn = start + N ngày', async () => {
    const course = await makeCourse(t.conn, { baseFee: 3_000_000 });
    const room = await makeRoom(t.conn);
    const cls = await makeClass(t.conn, { courseId: course._id, startDate: new Date('2026-01-20T00:00:00+07:00'), endDate: new Date('2026-04-20T00:00:00+07:00') });
    const r = await leadToAssigned(course, room, cls._id);
    const invoices = await m().Invoice.find({ studentId: r.studentId, kind: InvoiceKind.TUITION }).lean();
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ amountDue: 3_000_000, finalAmount: 3_000_000, balance: 3_000_000 });
    // Default invoiceDueDaysAfterStart = 7 → 2026-01-27.
    expect(invoices[0].dueDate.getTime()).toBe(fromDateOnly('2026-01-27').getTime());
    expect((await m().Enrollment.findById(r.enrollmentId).lean())?.invoiceId?.toString()).toBe(invoices[0]._id.toString());
    // The new student can log in with the temp password and sees the invoice via HTTP.
    const first = await login(r.code, r.tempPassword);
    const gated = await t.http().get(api('/invoices')).set(auth(first));
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe(ErrorCode.PASSWORD_CHANGE_REQUIRED);
    await t
      .http()
      .post(api('/auth/change-password'))
      .set(auth(first))
      .send({ currentPassword: r.tempPassword, newPassword: 'MatKhau123' })
      .expect(200);
    const me = await login(r.code, 'MatKhau123');
    const mine = await t.http().get(api('/invoices')).set(auth(me)).expect(200);
    expect(mine.body.data).toHaveLength(1);
  });

  it('(1) R23: xếp lớp đã bắt đầu → hạn = hôm nay (VN) + N ngày, không nằm trong quá khứ', async () => {
    const course = await makeCourse(t.conn, { baseFee: 1_500_000 });
    const room = await makeRoom(t.conn);
    const cls = await makeClass(t.conn, { courseId: course._id, startDate: new Date('2025-12-01T00:00:00+07:00') });
    const r = await leadToAssigned(course, room, cls._id);
    const [inv] = await m().Invoice.find({ studentId: r.studentId, kind: InvoiceKind.TUITION }).lean();
    // now = 2026-01-05 09:00 VN → 2026-01-05 + 7 = 2026-01-12.
    expect(inv.amountDue).toBe(1_500_000);
    expect(inv.dueDate.getTime()).toBe(fromDateOnly('2026-01-12').getTime());
  });

  it('(4) FR-SCH-04: hủy buổi → PUT attendance 422 SESSION_CANCELLED; HV ENROLLED nhận thông báo SESSION_CANCELLED', async () => {
    const course = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: course._id, teacherId: teacher.id });
    const st = await makeStudent(t.conn, { withUser: true });
    const e = await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: course._id,
      status: EnrollmentStatus.WAITING_CLASS,
      placementLevel: 'A1',
      waitingSince: t.clock.now(),
    });
    await act(e._id, 'assign', { classId: cls._id.toString() }).expect(201);
    const startAt = new Date(t.clock.now().getTime() + 24 * 60 * 60_000);
    const session = await makeSession(t.conn, { classId: cls._id, teacherId: teacher.id, startAt, endAt: new Date(startAt.getTime() + 90 * 60_000) });

    await t.http().post(api(`/sessions/${session._id}/cancel`)).set(auth(staff)).send({ reason: 'Giáo viên bận việc đột xuất' }).expect(200);

    const res = await t
      .http()
      .put(api(`/sessions/${session._id}/attendance`))
      .set(auth(teacher.token))
      .send({ records: [{ studentId: st._id.toString(), status: AttendanceStatus.PRESENT }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.SESSION_CANCELLED);

    const me = await login(st.code, DEFAULT_PASSWORD);
    const notes = await t.http().get(api('/notifications')).set(auth(me)).expect(200);
    expect((notes.body.data as Array<{ type: string }>).map((n) => n.type)).toContain(NotificationType.SESSION_CANCELLED);
  });

  it('(8) FR-CLS-10 + FR-ATT-04 + FR-GRD: kết thúc lớp → enrollment COMPLETED; HV vẫn xem /attendance, /results, assessments, transcript lớp đó', async () => {
    const course = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: course._id, teacherId: teacher.id });
    const st = await makeStudent(t.conn, { withUser: true });
    const e = await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: course._id,
      status: EnrollmentStatus.WAITING_CLASS,
      placementLevel: 'A1',
      waitingSince: t.clock.now(),
    });
    await act(e._id, 'assign', { classId: cls._id.toString() }).expect(201);
    const startAt = new Date(t.clock.now().getTime() + 10 * 60_000);
    const session = await makeSession(t.conn, { classId: cls._id, teacherId: teacher.id, startAt, endAt: new Date(startAt.getTime() + 90 * 60_000) });
    await t
      .http()
      .put(api(`/sessions/${session._id}/attendance`))
      .set(auth(teacher.token))
      .send({ records: [{ studentId: st._id.toString(), status: AttendanceStatus.PRESENT }] })
      .expect(200);
    const a = await makeAssessment(t.conn, { classId: cls._id, weight: 30 });
    await t
      .http()
      .put(api(`/assessments/${a._id}/grades`))
      .set(auth(teacher.token))
      .send({ grades: [{ studentId: st._id.toString(), score: 9 }], confirm: true })
      .expect(200);

    await t.http().patch(api(`/classes/${cls._id}`)).set(auth(manager)).send({ status: ClassStatus.ONGOING }).expect(200);
    await t.http().patch(api(`/classes/${cls._id}`)).set(auth(manager)).send({ status: ClassStatus.FINISHED }).expect(200);

    const after = await m().Enrollment.findById(e._id).lean();
    expect(after?.status).toBe(EnrollmentStatus.COMPLETED);

    const me = await login(st.code, DEFAULT_PASSWORD);
    const att = await t.http().get(api('/attendance')).set(auth(me)).expect(200);
    expect((att.body.data as Array<{ classId: string }>).map((r) => r.classId)).toContain(cls._id.toString());
    const res = await t.http().get(api('/results')).set(auth(me)).expect(200);
    const row = (res.body.data as Array<{ classId: string; average: number | null }>).find((r) => r.classId === cls._id.toString());
    expect(row).toMatchObject({ average: 9 });
    await t.http().get(api(`/classes/${cls._id}/assessments`)).set(auth(me)).expect(200);
    await t.http().get(api(`/results/transcript.pdf?studentId=${st._id}&classId=${cls._id}`)).set(auth(me)).expect(200);
  });
});
