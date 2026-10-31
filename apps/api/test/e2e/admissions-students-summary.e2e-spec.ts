import { Types } from 'mongoose';
import { EnrollmentStatus, InvoiceStatus, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeAssessment, makeClass, makeCourse, makeEnrollment, makeGrade, makeInvoice, makeStudent } from '../factories';

describe('FR-STU-02 Tóm tắt hồ sơ học viên (D22, D24)', () => {
  let t: TestApp;
  let manager: string;
  let teacher: { token: string; id: Types.ObjectId };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const detail = (token: string, id: Types.ObjectId) => t.http().get(`/api/v1/students/${id}`).set(auth(token));

  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    const tl = await loginAs(t, Role.TEACHER);
    teacher = { token: tl.token, id: tl.user._id };
  });
  afterAll(async () => {
    await t.close();
  });

  /** One confirmed assessment per class with the given score (weight 100 → class average = score). */
  async function score(classId: Types.ObjectId, studentId: Types.ObjectId, enrollmentId: Types.ObjectId, value: number, confirmed = true) {
    const a = await makeAssessment(t.conn, { classId, weight: 100, confirmedAt: confirmed ? new Date() : null });
    await makeGrade(t.conn, { assessmentId: a._id, studentId, enrollmentId, score: value, isDraft: !confirmed });
  }

  it('summary.averageScore = trung bình các TB lớp đã confirm (lớp A 8.0, lớp B 6.5 → 7.25)', async () => {
    const course = (await makeCourse(t.conn))._id;
    const hv = await makeStudent(t.conn);
    const ca = (await makeClass(t.conn, { courseId: course }))._id;
    const course2 = (await makeCourse(t.conn))._id;
    const cb = (await makeClass(t.conn, { courseId: course2 }))._id;
    const ea = await makeEnrollment(t.conn, { studentId: hv._id, courseId: course, classId: ca, status: EnrollmentStatus.ENROLLED });
    const eb = await makeEnrollment(t.conn, { studentId: hv._id, courseId: course2, classId: cb, status: EnrollmentStatus.ENROLLED });
    await score(ca, hv._id, ea._id, 8);
    await score(cb, hv._id, eb._id, 6.5);
    const res = await detail(manager, hv._id).expect(200);
    expect(res.body.data.summary.averageScore).toBe(7.25);
  });

  it('không có điểm → averageScore null', async () => {
    const hv = await makeStudent(t.conn);
    const res = await detail(manager, hv._id).expect(200);
    expect(res.body.data.summary.averageScore).toBeNull();
  });

  it('bài nháp không tính', async () => {
    const course = (await makeCourse(t.conn))._id;
    const hv = await makeStudent(t.conn);
    const ca = (await makeClass(t.conn, { courseId: course }))._id;
    const e = await makeEnrollment(t.conn, { studentId: hv._id, courseId: course, classId: ca, status: EnrollmentStatus.ENROLLED });
    await score(ca, hv._id, e._id, 9, false);
    const res = await detail(manager, hv._id).expect(200);
    expect(res.body.data.summary.averageScore).toBeNull();
  });

  it('outstandingBalance = Σ balance ≠ VOID (VOID bỏ qua)', async () => {
    const hv = await makeStudent(t.conn);
    await makeInvoice(t.conn, { studentId: hv._id, finalAmount: 1_000_000, amountDue: 1_000_000, balance: 600_000, status: InvoiceStatus.PARTIAL });
    await makeInvoice(t.conn, { studentId: hv._id, finalAmount: 500_000, amountDue: 500_000, balance: 500_000 });
    await makeInvoice(t.conn, { studentId: hv._id, finalAmount: 900_000, amountDue: 900_000, balance: 900_000, status: InvoiceStatus.VOID });
    const res = await detail(manager, hv._id).expect(200);
    expect(res.body.data.summary.outstandingBalance).toBe(1_100_000);
  });

  it('HV TRANSFERRED vẫn tính điểm lớp cũ', async () => {
    const course = (await makeCourse(t.conn))._id;
    const hv = await makeStudent(t.conn);
    const old = (await makeClass(t.conn, { courseId: course }))._id;
    const e = await makeEnrollment(t.conn, { studentId: hv._id, courseId: course, classId: null, classHistory: [old], status: EnrollmentStatus.TRANSFERRED });
    await score(old, hv._id, e._id, 7);
    const res = await detail(manager, hv._id).expect(200);
    expect(res.body.data.summary.averageScore).toBe(7);
  });

  it('currentClasses = các lớp ENROLLED, sắp theo code', async () => {
    const hv = await makeStudent(t.conn);
    const cs = await Promise.all([1, 2, 3].map(async () => (await makeCourse(t.conn))._id));
    const c2 = await makeClass(t.conn, { courseId: cs[0], code: 'ZZ-02' });
    const c1 = await makeClass(t.conn, { courseId: cs[1], code: 'AA-01' });
    const c3 = await makeClass(t.conn, { courseId: cs[2], code: 'MM-03' });
    await makeEnrollment(t.conn, { studentId: hv._id, courseId: cs[0], classId: c2._id, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: hv._id, courseId: cs[1], classId: c1._id, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: hv._id, courseId: cs[2], classId: c3._id, status: EnrollmentStatus.COMPLETED });
    const res = await detail(manager, hv._id).expect(200);
    expect(res.body.data.currentClasses).toEqual([
      { classId: c1._id.toString(), code: 'AA-01' },
      { classId: c2._id.toString(), code: 'ZZ-02' },
    ]);
    const list = await t.http().get(`/api/v1/students?q=${hv.code}`).set(auth(manager)).expect(200);
    expect(list.body.data[0].currentClasses.map((c: { code: string }) => c.code)).toEqual(['AA-01', 'ZZ-02']);
  });

  it('GV chỉ thấy lớp của mình trong currentClasses', async () => {
    const course = (await makeCourse(t.conn))._id;
    const hv = await makeStudent(t.conn);
    const course2 = (await makeCourse(t.conn))._id;
    const mine = await makeClass(t.conn, { courseId: course, code: 'MINE-01', teacherId: teacher.id });
    const other = await makeClass(t.conn, { courseId: course2, code: 'AAA-OTHER' });
    await makeEnrollment(t.conn, { studentId: hv._id, courseId: course, classId: mine._id, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: hv._id, courseId: course2, classId: other._id, status: EnrollmentStatus.ENROLLED });
    const res = await detail(teacher.token, hv._id).expect(200);
    expect(res.body.data.currentClasses).toEqual([{ classId: mine._id.toString(), code: 'MINE-01' }]);
    const list = await t.http().get(`/api/v1/students?q=${hv.code}`).set(auth(teacher.token)).expect(200);
    expect(list.body.data[0].currentClasses).toEqual([{ classId: mine._id.toString(), code: 'MINE-01' }]);
  });

  it('lớp chưa có điểm confirm (TB null) bị bỏ qua khỏi trung bình', async () => {
    const c1 = (await makeCourse(t.conn))._id;
    const c2 = (await makeCourse(t.conn))._id;
    const hv = await makeStudent(t.conn);
    const ca = (await makeClass(t.conn, { courseId: c1 }))._id;
    const cb = (await makeClass(t.conn, { courseId: c2 }))._id;
    const ea = await makeEnrollment(t.conn, { studentId: hv._id, courseId: c1, classId: ca, status: EnrollmentStatus.ENROLLED });
    const eb = await makeEnrollment(t.conn, { studentId: hv._id, courseId: c2, classId: cb, status: EnrollmentStatus.ENROLLED });
    await score(ca, hv._id, ea._id, 8);
    await score(cb, hv._id, eb._id, 5, false);
    const res = await detail(manager, hv._id).expect(200);
    expect(res.body.data.summary.averageScore).toBe(8);
  });

  describe('currentClasses trong kết quả PATCH', () => {
    let n = 0;
    async function setup() {
      n += 1;
      const cs = [(await makeCourse(t.conn))._id, (await makeCourse(t.conn))._id];
      const hv = await makeStudent(t.conn);
      const k2 = await makeClass(t.conn, { courseId: cs[0], code: `PB-0${n}2` });
      const k1 = await makeClass(t.conn, { courseId: cs[1], code: `PA-0${n}1` });
      await makeEnrollment(t.conn, { studentId: hv._id, courseId: cs[0], classId: k2._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: hv._id, courseId: cs[1], classId: k1._id, status: EnrollmentStatus.ENROLLED });
      const expected = [
        { classId: k1._id.toString(), code: `PA-0${n}1` },
        { classId: k2._id.toString(), code: `PB-0${n}2` },
      ];
      return { hv, expected };
    }
    it('MANAGER PATCH /students/:id (có đổi) trả currentClasses thật', async () => {
      const { hv, expected } = await setup();
      const res = await t.http().patch(`/api/v1/students/${hv._id}`).set(auth(manager)).send({ note: 'ghi chú mới' }).expect(200);
      expect(res.body.data.student.currentClasses).toEqual(expected);
    });
    it('MANAGER PATCH không đổi gì (no-op) vẫn trả currentClasses thật', async () => {
      const { hv, expected } = await setup();
      const res = await t.http().patch(`/api/v1/students/${hv._id}`).set(auth(manager)).send({}).expect(200);
      expect(res.body.data.student.currentClasses).toEqual(expected);
    });
    it('HV PATCH /students/me/contact trả currentClasses thật', async () => {
      const { hv, expected } = await setup();
      const tok = (await loginAs(t, Role.STUDENT, { studentId: hv._id })).token;
      const res = await t.http().patch('/api/v1/students/me/contact').set(auth(tok)).send({ address: 'Số 1 Hà Nội' }).expect(200);
      expect(res.body.data.student.currentClasses).toEqual(expected);
    });
  });
});
