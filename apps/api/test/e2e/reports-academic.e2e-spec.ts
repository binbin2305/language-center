import { ALL_ROLES, AssessmentType, Role } from '@lc/shared';
import { makeAssessment, makeClass, makeCourse, makeEnrollment, makeGrade, makeStudent, makeTeacher } from '../factories';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const vn = (d: string, hhmm = '00:00') => new Date(`${d}T${hhmm}:00+07:00`);
const FROM = '2026-02-01';
const TO = '2026-02-28';
const CONFIRMED = new Date('2026-03-01T00:00:00Z');

describe('FR-RPT-03 Báo cáo học tập (GET /reports/academic)', () => {
  let t: TestApp;
  let manager: string;
  let c1: { id: string; code: string; courseId: string; teacherId: string };
  let c2: { id: string; code: string };
  let c3: { id: string; code: string };
  let teacher1Id: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (token: string, qs: string) => t.http().get(`/api/v1/reports/academic?${qs}`).set(auth(token));

  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    const course = await makeCourse(t.conn);
    const teacher1 = await makeTeacher(t.conn);
    teacher1Id = teacher1._id.toString();
    const k1 = await makeClass(t.conn, { courseId: course._id, teacherId: teacher1._id });
    const k2 = await makeClass(t.conn, { courseId: course._id });
    const k3 = await makeClass(t.conn, { courseId: course._id });
    c1 = { id: k1._id.toString(), code: k1.code, courseId: course._id.toString(), teacherId: teacher1Id };
    c2 = { id: k2._id.toString(), code: k2.code };
    c3 = { id: k3._id.toString(), code: k3.code };

    const enroll = async (cls: typeof k1) => {
      const s = await makeStudent(t.conn);
      const e = await makeEnrollment(t.conn, { studentId: s._id, courseId: course._id, classId: cls._id, status: 'ENROLLED' });
      return { s, e };
    };
    const score = (a: { _id: unknown }, cls: typeof k1, who: { s: { _id: unknown }; e: { _id: unknown } }, v: number | null) =>
      makeGrade(t.conn, { assessmentId: a._id as never, classId: cls._id, studentId: who.s._id as never, enrollmentId: who.e._id as never, score: v, isDraft: false });

    // Lớp 1: 3 HV; điểm trọng số 10 + 30
    const quiz = await makeAssessment(t.conn, { classId: k1._id, weight: 10, heldOn: vn('2026-02-01'), confirmedAt: CONFIRMED });
    const exam = await makeAssessment(t.conn, { classId: k1._id, weight: 30, type: AssessmentType.FINAL, heldOn: vn('2026-02-28', '23:59'), confirmedAt: CONFIRMED });
    const a = await enroll(k1);
    const b = await enroll(k1);
    const c = await enroll(k1);
    await score(quiz, k1, a, 8);
    await score(exam, k1, a, 8); // TB 8.0 GOOD
    await score(quiz, k1, b, 6.5);
    await score(exam, k1, b, 6.5); // TB 6.5 FAIR
    const cq = await score(quiz, k1, c, 5);
    const ce = await score(exam, k1, c, 5);
    // Ghi thô 4.99 (bỏ qua validator bước 0.25) để kiểm biên FAIL: TB 4.99
    await t.conn.collection('grades').updateMany({ _id: { $in: [cq._id, ce._id] } }, { $set: { score: 4.99 } });
    // Bài chưa confirm: không tính
    const draft = await makeAssessment(t.conn, { classId: k1._id, weight: 50, heldOn: vn('2026-02-10'), confirmedAt: null });
    await score(draft, k1, a, 0);
    // Bài confirm nhưng heldOn ngoài khoảng: không tính
    const late = await makeAssessment(t.conn, { classId: k1._id, weight: 50, heldOn: vn('2026-03-01'), confirmedAt: CONFIRMED });
    await score(late, k1, a, 0);
    const early = await makeAssessment(t.conn, { classId: k1._id, weight: 50, heldOn: vn('2026-01-31', '23:59'), confirmedAt: CONFIRMED });
    await score(early, k1, a, 0);

    // Lớp 2: 1 HV, 2 bài để kiểm TB lớp làm tròn: HV x 7.25, HV y 8
    const q2 = await makeAssessment(t.conn, { classId: k2._id, weight: 20, heldOn: vn('2026-02-05'), confirmedAt: CONFIRMED });
    const x = await enroll(k2);
    const y = await enroll(k2);
    await score(q2, k2, x, 7.25);
    await score(q2, k2, y, 8.5);
    // HV chưa có điểm (score null) -> không tính vào students
    const z = await enroll(k2);
    await score(q2, k2, z, null);

    // Lớp 3: có HV nhưng chưa có điểm confirm -> averageScore null
    await enroll(k3);
    await makeAssessment(t.conn, { classId: k3._id, weight: 10, heldOn: vn('2026-02-05'), confirmedAt: null });
  });
  afterAll(async () => {
    await t.close();
  });

  const row = (body: { data: { rows: { classId: string }[] } }, id: string) => body.data.rows.find((r) => r.classId === id) as Record<string, unknown>;

  it('FR-RPT-03 chỉ bài confirm có heldOn trong khoảng (nháp, 01/03 00:00 VN, 31/01 23:59 VN không tính)', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${c1.id}`);
    expect(r.status).toBe(200);
    expect(row(r.body, c1.id)).toMatchObject({ classCode: c1.code, courseId: c1.courseId, teacherId: c1.teacherId, students: 3 });
    // TB HV: 8, 6.5, 4.99 -> (8+6.5+4.99)/3 = 6.4967 -> 6.5
    expect(row(r.body, c1.id).averageScore).toBe(6.5);
  });

  it('FR-RPT-03 TB lớp = trung bình TB HV, làm tròn 2 (7.25 và 8.5 -> 7.88)', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${c2.id}`);
    expect(row(r.body, c2.id)).toMatchObject({ students: 2, averageScore: 7.88, passRate: 1 });
  });

  it('FR-RPT-03 distribution đếm theo classify (8.0 GOOD, 6.5 FAIR, 4.99 FAIL)', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${c1.id}`);
    expect(r.body.data.distribution).toMatchObject({ GOOD: 1, FAIR: 1, FAIL: 1 });
    expect(r.body.data.distribution.EXCELLENT ?? 0).toBe(0);
    expect(r.body.data.distribution.AVERAGE ?? 0).toBe(0);
  });

  it('FR-RPT-03 passRate/failRate trên các HV-lớp có TB (2 đạt / 3 -> 0.6667 và 0.3333)', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${c1.id}`);
    expect(r.body.data.passRate).toBe(0.6667);
    expect(r.body.data.failRate).toBe(0.3333);
    expect(row(r.body, c1.id).passRate).toBe(0.6667);
  });

  it('FR-RPT-03 lớp không có điểm -> averageScore null, passRate null (không NaN)', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&classId=${c3.id}`);
    expect(row(r.body, c3.id)).toMatchObject({ students: 0, averageScore: null, passRate: null });
    expect(r.body.data.passRate).toBe(0);
    expect(r.body.data.failRate).toBe(0);
  });

  it('FR-RPT-03 teacherId lọc theo GV phụ trách lớp', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&teacherId=${teacher1Id}`);
    expect(r.body.data.rows.map((x: { classId: string }) => x.classId)).toEqual([c1.id]);
  });

  it('FR-RPT-03 courseId lọc và trả mọi lớp của khóa (kể cả lớp không có điểm)', async () => {
    const r = await get(manager, `from=${FROM}&to=${TO}&courseId=${c1.courseId}`);
    expect(r.body.data.rows.map((x: { classId: string }) => x.classId).sort()).toEqual([c1.id, c2.id, c3.id].sort());
  });

  it('FR-RPT-03 lớp kết thúc trước from không có trong rows; lớp bắt đầu sau to không có; lớp chồng một ngày có', async () => {
    const course = await makeCourse(t.conn);
    const mk = (startDate: string, endDate: string) => makeClass(t.conn, { courseId: course._id, startDate: vn(startDate), endDate: vn(endDate) } as never);
    const before = await mk('2025-10-01', '2026-01-31');
    const after = await mk('2026-03-01', '2026-06-01');
    const touchFrom = await mk('2025-12-01', '2026-02-01');
    const touchTo = await mk('2026-02-28', '2026-06-01');
    const r = await get(manager, `from=${FROM}&to=${TO}&courseId=${course._id.toString()}`);
    const ids = r.body.data.rows.map((x: { classId: string }) => x.classId);
    expect(ids).not.toContain(before._id.toString());
    expect(ids).not.toContain(after._id.toString());
    expect(ids.sort()).toEqual([touchFrom._id.toString(), touchTo._id.toString()].sort());
  });

  it('FR-RPT-03 to < from -> 400', async () => {
    expect((await get(manager, 'from=2026-02-28&to=2026-02-01')).status).toBe(400);
  });

  it('FR-RPT-03 ACADEMIC_STAFF xem được; mọi role khác (T, H, A, STUDENT) -> 403', async () => {
    expect((await get((await loginAs(t, Role.ACADEMIC_STAFF)).token, `from=${FROM}&to=${TO}`)).status).toBe(200);
    for (const role of ALL_ROLES.filter((r) => r !== Role.MANAGER && r !== Role.ACADEMIC_STAFF)) {
      expect((await get((await loginAs(t, role)).token, `from=${FROM}&to=${TO}`)).status).toBe(403);
    }
  });
});
