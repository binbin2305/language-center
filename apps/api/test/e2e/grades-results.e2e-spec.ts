import { Types } from 'mongoose';
import { AssessmentType, ClassStatus, EnrollmentStatus, GradeClass, Role } from '@lc/shared';
import { makeClass, makeEnrollment } from '../factories/academic.factory';
import { makeAssessment, makeGrade } from '../factories/assessment.factory';
import { makeStudent } from '../factories/student.factory';
import { DEFAULT_PASSWORD } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { pdfText } from '../helpers/pdf-text';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-GRD-05/06/08 Kết quả & phiếu điểm', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const loginStudent = async (username: string) => {
    const res = await t.http().post('/api/v1/auth/login').send({ username, password: DEFAULT_PASSWORD });
    return { token: res.body.data.accessToken as string };
  };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const results = (token: string, qs = '') => t.http().get(`/api/v1/results${qs}`).set(auth(token));
  const transcript = (token: string, studentId: unknown, classId: unknown) =>
    t.http().get(`/api/v1/results/transcript.pdf?studentId=${studentId}&classId=${classId}`).set(auth(token)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });

  async function setup(enrollStatus: EnrollmentStatus = EnrollmentStatus.ENROLLED) {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id, status: ClassStatus.ONGOING });
    const st = await makeStudent(t.conn, { withUser: true });
    const en = await makeEnrollment(t.conn, { studentId: st._id, classId: cls._id, courseId: cls.courseId, status: enrollStatus });
    const mk = async (type: AssessmentType, weight: number, score: number | null, confirm: boolean, isDraft = false) => {
      const a = await makeAssessment(t.conn, { classId: cls._id, type, weight, ...(confirm ? { confirmedAt: new Date() } : {}) });
      await makeGrade(t.conn, { assessmentId: a._id, studentId: st._id, enrollmentId: en._id, score, isDraft });
      return a;
    };
    return { teacher, cls, st, en, mk };
  }

  it('FR-GRD-05 TB trọng số: QUIZ 20% 8, MIDTERM 30% 6, FINAL 50% chưa confirm -> 6.8, FAIR, passed', async () => {
    const { teacher, cls, st, mk } = await setup();
    await mk(AssessmentType.QUIZ, 20, 8, true);
    await mk(AssessmentType.MIDTERM, 30, 6, true);
    await mk(AssessmentType.FINAL, 50, 9, false);
    const r = await results(teacher.token, `?classId=${cls._id}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    const row = r.body.data[0];
    expect(row.studentId).toBe(String(st._id));
    expect(row.items).toHaveLength(2);
    expect(row).toMatchObject({ average: 6.8, gradeClass: GradeClass.FAIR, passed: true, classCode: cls.code, className: cls.name });
    expect(r.body.meta.total).toBe(1);
  });

  it('FR-GRD-05 làm tròn 2 chữ số', async () => {
    const { teacher, cls, mk } = await setup();
    await mk(AssessmentType.QUIZ, 10, 7.25, true);
    await mk(AssessmentType.MIDTERM, 20, 8.5, true);
    const r = await results(teacher.token, `?classId=${cls._id}`);
    expect(r.body.data[0].average).toBe(8.08);
  });

  it('FR-GRD-05 bài nháp không tính', async () => {
    const { teacher, cls, mk } = await setup();
    await mk(AssessmentType.QUIZ, 20, 4, true);
    await mk(AssessmentType.MIDTERM, 30, 10, false, true);
    const r = await results(teacher.token, `?classId=${cls._id}`);
    expect(r.body.data[0]).toMatchObject({ average: 4, gradeClass: GradeClass.FAIL, passed: false });
    expect(r.body.data[0].items).toHaveLength(1);
  });

  it('FR-GRD-05 không bài confirm -> average null, gradeClass null', async () => {
    const { teacher, cls, mk } = await setup();
    await mk(AssessmentType.QUIZ, 20, 4, false);
    const r = await results(teacher.token, `?classId=${cls._id}`);
    expect(r.body.data[0]).toMatchObject({ average: null, gradeClass: null, passed: null, items: [] });
  });

  it('FR-GRD-06 HV chỉ của mình (query studentId khác bị ghi đè)', async () => {
    const a = await setup();
    await a.mk(AssessmentType.QUIZ, 20, 8, true);
    const b = await setup();
    await b.mk(AssessmentType.QUIZ, 20, 5, true);
    const me = await loginStudent(a.st.code);
    const r = await results(me.token, `?studentId=${b.st._id}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0].studentId).toBe(String(a.st._id));
  });

  it('FR-CLS-12 HV TRANSFERRED xem kết quả lớp cũ', async () => {
    const a = await setup(EnrollmentStatus.TRANSFERRED);
    await a.mk(AssessmentType.QUIZ, 20, 8, true);
    const me = await loginStudent(a.st.code);
    const r = await results(me.token);
    expect(r.status).toBe(200);
    expect(r.body.data[0]).toMatchObject({ classId: String(a.cls._id), average: 8 });
  });

  it('FR-GRD-06 GV lớp khác không thấy; GV lớp mình thấy', async () => {
    const a = await setup();
    await a.mk(AssessmentType.QUIZ, 20, 8, true);
    const other = await loginAs(t, Role.TEACHER);
    expect((await results(other.token)).body.data).toEqual([]);
    expect((await results(other.token, `?classId=${a.cls._id}`)).body.data).toEqual([]);
    expect((await results(a.teacher.token)).body.data).toHaveLength(1);
  });

  it('FR-GRD-06 M, S lọc theo courseId', async () => {
    const a = await setup();
    await a.mk(AssessmentType.QUIZ, 20, 8, true);
    for (const role of [Role.MANAGER, Role.ACADEMIC_STAFF]) {
      const u = await loginAs(t, role);
      const r = await results(u.token, `?courseId=${a.cls.courseId}`);
      expect(r.status).toBe(200);
      expect(r.body.data).toHaveLength(1);
    }
  });

  it('FR-GRD-06 ADMIN -> 403', async () => {
    const admin = await loginAs(t, Role.ADMIN);
    expect((await results(admin.token)).status).toBe(403);
    expect((await transcript(admin.token, new Types.ObjectId(), new Types.ObjectId())).status).toBe(403);
  });

  it('FR-GRD-08 transcript -> 200 application/pdf, chứa họ tên HV và mã lớp; tên file', async () => {
    const a = await setup();
    await a.mk(AssessmentType.QUIZ, 20, 8, true);
    for (const role of [Role.MANAGER, Role.ACADEMIC_STAFF]) {
      const u = await loginAs(t, role);
      const r = await transcript(u.token, a.st._id, a.cls._id);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('application/pdf');
      expect(r.headers['content-disposition']).toBe(`attachment; filename="phieu-diem-${a.st.code}-${a.cls.code}.pdf"`);
      const text = await pdfText(r.body as Buffer);
      expect(text).toContain(a.st.fullName);
      expect(text).toContain(a.cls.code);
    }
    const me = await loginStudent(a.st.code);
    expect((await transcript(me.token, a.st._id, a.cls._id)).status).toBe(200);
  });

  it('FR-GRD-08 T transcript -> 403', async () => {
    const a = await setup();
    expect((await transcript(a.teacher.token, a.st._id, a.cls._id)).status).toBe(403);
  });

  it('FR-GRD-08 HV transcript của người khác -> 404; lớp không có enrollment -> 404', async () => {
    const a = await setup();
    const b = await setup();
    const me = await loginStudent(a.st.code);
    expect((await transcript(me.token, b.st._id, b.cls._id)).status).toBe(404);
    const m = await loginAs(t, Role.MANAGER);
    expect((await transcript(m.token, a.st._id, b.cls._id)).status).toBe(404);
  });
});
