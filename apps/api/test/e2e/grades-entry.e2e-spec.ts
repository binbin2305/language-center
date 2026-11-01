import { Types } from 'mongoose';
import { ClassStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { makeClass, makeEnrollment } from '../factories/academic.factory';
import { makeAssessment, makeGrade } from '../factories/assessment.factory';
import { makeStudent } from '../factories/student.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-GRD-02 FR-GRD-03 Nhập điểm', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const put = (id: unknown, token: string, body: object) =>
    t.http().put(`/api/v1/assessments/${id}/grades`).set(auth(token)).send(body);
  const get = (id: unknown, token: string) => t.http().get(`/api/v1/assessments/${id}/grades`).set(auth(token));

  async function setup(n = 2) {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id, status: ClassStatus.ONGOING });
    const a = await makeAssessment(t.conn, { classId: cls._id });
    const students = [];
    for (let i = 0; i < n; i++) {
      const st = await makeStudent(t.conn, { withUser: true });
      const en = await makeEnrollment(t.conn, { studentId: st._id, classId: cls._id, courseId: cls.courseId, status: EnrollmentStatus.ENROLLED });
      students.push({ st, en });
    }
    return { teacher, cls, a, students };
  }

  it('FR-GRD-02 score 10.25 -> 400 SCORE_OUT_OF_RANGE details.studentIds; 7.3, -1 -> 400', async () => {
    const { teacher, a, students } = await setup();
    const id = String(students[0].st._id);
    const r = await put(a._id, teacher.token, { grades: [{ studentId: id, score: 10.25 }] });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe(ErrorCode.SCORE_OUT_OF_RANGE);
    expect(r.body.error.details.studentIds).toEqual([id]);
    expect((await put(a._id, teacher.token, { grades: [{ studentId: id, score: 7.3 }] })).status).toBe(400);
    expect((await put(a._id, teacher.token, { grades: [{ studentId: id, score: -1 }] })).status).toBe(400);
  });

  it.each([0, 7.25, 10])('FR-GRD-02 score %s -> 200', async (score) => {
    const { teacher, a, students } = await setup();
    const r = await put(a._id, teacher.token, { grades: [{ studentId: String(students[0].st._id), score }] });
    expect(r.status).toBe(200);
    expect(r.body.data.rows.find((x: { studentId: string }) => x.studentId === String(students[0].st._id)).score).toBe(score);
  });

  it('FR-GRD-02 studentId ngoài roster -> 400 STUDENT_NOT_IN_ROSTER', async () => {
    const { teacher, a } = await setup();
    const other = await makeStudent(t.conn);
    const r = await put(a._id, teacher.token, { grades: [{ studentId: String(other._id), score: 5 }] });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe(ErrorCode.STUDENT_NOT_IN_ROSTER);
  });

  it('FR-GRD-02 confirm:false thiếu điểm -> 200 lưu nháp (isDraft true)', async () => {
    const { teacher, a, students } = await setup();
    const r = await put(a._id, teacher.token, { grades: [{ studentId: String(students[0].st._id), score: 6 }] });
    expect(r.status).toBe(200);
    expect(r.body.data.assessment.confirmedAt).toBeNull();
    const row = r.body.data.rows.find((x: { studentId: string }) => x.studentId === String(students[0].st._id));
    expect(row).toMatchObject({ score: 6, isDraft: true, left: false });
  });

  it('FR-GRD-03 confirm:true thiếu -> 422 GRADES_INCOMPLETE details.studentIds', async () => {
    const { teacher, a, students } = await setup();
    const r = await put(a._id, teacher.token, { grades: [{ studentId: String(students[0].st._id), score: 6 }], confirm: true });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.GRADES_INCOMPLETE);
    expect(r.body.error.details.studentIds).toEqual([String(students[1].st._id)]);
    expect(await t.conn.model('Grade').countDocuments({ assessmentId: a._id })).toBe(0);
  });

  it('FR-GRD-03 confirm:true đủ -> confirmedAt, isDraft false, notification GRADES_PUBLISHED tới HV', async () => {
    const { teacher, a, students } = await setup();
    const r = await put(a._id, teacher.token, {
      grades: students.map((s, i) => ({ studentId: String(s.st._id), score: 5 + i })),
      confirm: true,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.assessment.confirmedAt).not.toBeNull();
    expect(r.body.data.rows.every((x: { isDraft: boolean }) => !x.isDraft)).toBe(true);
    const notes = await t.conn.model('Notification').find({ type: 'GRADES_PUBLISHED', refId: a._id }).lean();
    expect(notes.map((n) => String(n.userId)).sort()).toEqual(students.map((s) => String(s.st.userId)).sort());
    expect(notes[0]).toMatchObject({ refType: 'ASSESSMENT' });
  });

  it('FR-GRD-03 HV TRANSFERRED trước khi confirm không bắt buộc; điểm cũ vẫn trả với left true', async () => {
    const { teacher, cls, a, students } = await setup(2);
    const left = await makeStudent(t.conn, { withUser: true });
    const en = await makeEnrollment(t.conn, { studentId: left._id, classId: cls._id, courseId: cls.courseId, status: EnrollmentStatus.TRANSFERRED });
    await makeGrade(t.conn, { assessmentId: a._id, studentId: left._id, enrollmentId: en._id, score: 4 });
    const r = await put(a._id, teacher.token, {
      grades: students.map((s) => ({ studentId: String(s.st._id), score: 8 })),
      confirm: true,
    });
    expect(r.status).toBe(200);
    const row = r.body.data.rows.find((x: { studentId: string }) => x.studentId === String(left._id));
    expect(row).toMatchObject({ left: true, score: 4 });
    const notified = await t.conn.model('Notification').countDocuments({ type: 'GRADES_PUBLISHED', refId: a._id });
    expect(notified).toBe(2);
    const g = await get(a._id, teacher.token);
    expect(g.status).toBe(200);
    expect(g.body.data.rows).toHaveLength(3);
  });

  it('FR-GRD-02 R10 score null xóa điểm nháp đã lưu; ghi đè điểm nháp', async () => {
    const { teacher, a, students } = await setup(1);
    const id = String(students[0].st._id);
    await put(a._id, teacher.token, { grades: [{ studentId: id, score: 6 }] }).expect(200);
    const over = await put(a._id, teacher.token, { grades: [{ studentId: id, score: 7.5 }] });
    expect(over.body.data.rows[0].score).toBe(7.5);
    const r = await put(a._id, teacher.token, { grades: [{ studentId: id, score: null }] });
    expect(r.status).toBe(200);
    expect(r.body.data.rows[0].score).toBeNull();
  });

  it('FR-GRD-03 R10 confirm:true với null cho HV đã có điểm -> 422 GRADES_INCOMPLETE liệt kê HV đó', async () => {
    const { teacher, a, students } = await setup(2);
    const [x, y] = students.map((q) => String(q.st._id));
    await put(a._id, teacher.token, { grades: [{ studentId: x, score: 6 }, { studentId: y, score: 6 }] }).expect(200);
    const r = await put(a._id, teacher.token, { grades: [{ studentId: x, score: null }], confirm: true });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.GRADES_INCOMPLETE);
    expect(r.body.error.details.studentIds).toEqual([x]);
  });

  it('FR-GRD-02 nhiều điểm sai liệt kê một lần; studentId trùng -> 400 VALIDATION_FAILED', async () => {
    const { teacher, a, students } = await setup(2);
    const [x, y] = students.map((q) => String(q.st._id));
    const r = await put(a._id, teacher.token, { grades: [{ studentId: x, score: 11 }, { studentId: y, score: 7.1 }] });
    expect(r.body.error.code).toBe(ErrorCode.SCORE_OUT_OF_RANGE);
    expect([...r.body.error.details.studentIds].sort()).toEqual([x, y].sort());
    const d = await put(a._id, teacher.token, { grades: [{ studentId: x, score: 5 }, { studentId: x, score: 6 }] });
    expect(d.status).toBe(400);
    expect(d.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(d.body.error.details.fields.grades).toBe('DUPLICATE_STUDENT');
  });

  it('FR-GRD-03 R11 sau confirm thêm điểm cho HV roster chưa có điểm -> 200 isDraft false', async () => {
    const { teacher, cls, a, students } = await setup(1);
    await put(a._id, teacher.token, { grades: [{ studentId: String(students[0].st._id), score: 7 }], confirm: true }).expect(200);
    const late = await makeStudent(t.conn, { withUser: true });
    await makeEnrollment(t.conn, { studentId: late._id, classId: cls._id, courseId: cls.courseId, status: EnrollmentStatus.ENROLLED });
    const r = await put(a._id, teacher.token, { grades: [{ studentId: String(late._id), score: 5 }] });
    expect(r.status).toBe(200);
    expect(r.body.data.rows.find((x: { studentId: string }) => x.studentId === String(late._id))).toMatchObject({ score: 5, isDraft: false });
  });

  it('FR-GRD-03 PUT sau confirm với điểm đã có -> 422 INVALID_STATUS_TRANSITION', async () => {
    const { teacher, a, students } = await setup(1);
    const body = { grades: [{ studentId: String(students[0].st._id), score: 7 }], confirm: true };
    await put(a._id, teacher.token, body).expect(200);
    const r = await put(a._id, teacher.token, { grades: [{ studentId: String(students[0].st._id), score: 9 }] });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
  });

  it('FR-GRD-03 bảng điểm khóa -> 422 GRADEBOOK_LOCKED', async () => {
    const { teacher, cls, students } = await setup(1);
    const a = await makeAssessment(t.conn, { classId: cls._id, heldOn: new Date('2025-11-01T00:00:00+07:00') });
    const r = await put(a._id, teacher.token, { grades: [{ studentId: String(students[0].st._id), score: 7 }] });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.GRADEBOOK_LOCKED);
  });

  describe('quyền', () => {
    it.each([Role.ACADEMIC_STAFF, Role.MANAGER, Role.ADMIN, Role.STUDENT])('FR-GRD-02 %s PUT -> 403', async (role) => {
      const { a, students } = await setup(1);
      const u = await loginAs(t, role);
      const r = await put(a._id, u.token, { grades: [{ studentId: String(students[0].st._id), score: 5 }] });
      expect(r.status).toBe(403);
    });

    it.each([Role.ADMIN, Role.STUDENT])('FR-GRD-02 %s GET -> 403', async (role) => {
      const { a } = await setup(1);
      expect((await get(a._id, (await loginAs(t, role)).token)).status).toBe(403);
    });

    it('FR-GRD-02 GV lớp khác PUT/GET -> 404; assessment không tồn tại / id hỏng -> 404', async () => {
      const { a, students } = await setup(1);
      const other = await loginAs(t, Role.TEACHER);
      const body = { grades: [{ studentId: String(students[0].st._id), score: 5 }] };
      expect((await put(a._id, other.token, body)).status).toBe(404);
      expect((await get(a._id, other.token)).status).toBe(404);
      expect((await put(new Types.ObjectId(), other.token, body)).status).toBe(404);
      expect((await get('xyz', other.token)).status).toBe(404);
    });

    it('FR-GRD-02 trợ giảng PUT -> 200; M/S GET -> 200', async () => {
      const { cls, a, students } = await setup(1);
      const ta = await loginAs(t, Role.TEACHER);
      await t.conn.model('Class').updateOne({ _id: cls._id }, { assistantTeacherId: ta.user._id });
      const r = await put(a._id, ta.token, { grades: [{ studentId: String(students[0].st._id), score: 5 }] });
      expect(r.status).toBe(200);
      for (const role of [Role.MANAGER, Role.ACADEMIC_STAFF]) {
        expect((await get(a._id, (await loginAs(t, role)).token)).status).toBe(200);
      }
    });
  });
});
