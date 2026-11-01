import { Types } from 'mongoose';
import { CourseStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeCourse, makeEnrollment, makeStudent, models } from '../factories';

describe('FR-ADM-06 FR-ADM-07 Đăng ký khóa học', () => {
  let t: TestApp;
  let manager: string;
  let staff: string;
  let admin: string;
  let teacher: string;
  let hv: { token: string; student: Awaited<ReturnType<typeof makeStudent>> };
  let hv2: { token: string; student: Awaited<ReturnType<typeof makeStudent>> };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (token: string, body: object) => t.http().post('/api/v1/enrollments').set(auth(token)).send(body);
  const patchCourse = (token: string, id: string | Types.ObjectId, body: object) =>
    t.http().patch(`/api/v1/enrollments/${id}/course`).set(auth(token)).send(body);
  const list = (token: string, qs = '') => t.http().get(`/api/v1/enrollments${qs}`).set(auth(token));

  async function student() {
    const s = await makeStudent(t.conn);
    const l = await loginAs(t, Role.STUDENT, { studentId: s._id });
    return { token: l.token, student: s };
  }

  beforeAll(async () => {
    t = await createTestApp();
    await models(t.conn).Enrollment.syncIndexes();
    manager = (await loginAs(t, Role.MANAGER)).token;
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    admin = (await loginAs(t, Role.ADMIN)).token;
    teacher = (await loginAs(t, Role.TEACHER)).token;
    hv = await student();
    hv2 = await student();
  });
  afterAll(async () => {
    await t.close();
  });

  it('HV tự đăng ký khóa → 201 PENDING_PLACEMENT, studentId = của mình', async () => {
    const c = await makeCourse(t.conn);
    const res = await post(hv.token, { courseId: c._id.toString() }).expect(201);
    expect(res.body.data).toMatchObject({
      studentId: hv.student._id.toString(),
      courseId: c._id.toString(),
      status: EnrollmentStatus.PENDING_PLACEMENT,
    });
  });

  it('HV gửi studentId của mình → 201; gửi studentId người khác → 400 VALIDATION_FAILED fields.studentId', async () => {
    const c = await makeCourse(t.conn);
    await post(hv.token, { courseId: c._id.toString(), studentId: hv.student._id.toString() }).expect(201);
    const c2 = await makeCourse(t.conn);
    const res = await post(hv.token, { courseId: c2._id.toString(), studentId: hv2.student._id.toString() }).expect(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.details.fields).toHaveProperty('studentId');
  });

  it('trùng hoạt động → 409 ENROLLMENT_EXISTS', async () => {
    const c = await makeCourse(t.conn);
    await post(hv2.token, { courseId: c._id.toString() }).expect(201);
    const res = await post(hv2.token, { courseId: c._id.toString() }).expect(409);
    expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_EXISTS);
  });

  it('S tạo cho HV → 201; M cũng được', async () => {
    const s = await makeStudent(t.conn);
    const c = await makeCourse(t.conn);
    const res = await post(staff, { studentId: s._id.toString(), courseId: c._id.toString() }).expect(201);
    expect(res.body.data.studentId).toBe(s._id.toString());
    const c2 = await makeCourse(t.conn);
    await post(manager, { studentId: s._id.toString(), courseId: c2._id.toString() }).expect(201);
  });

  it('S thiếu studentId → 400 fields.studentId', async () => {
    const c = await makeCourse(t.conn);
    const res = await post(staff, { courseId: c._id.toString() }).expect(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.details.fields).toHaveProperty('studentId');
  });

  it('course ARCHIVED → 400 fields.courseId', async () => {
    const c = await makeCourse(t.conn, { status: CourseStatus.ARCHIVED });
    const res = await post(hv.token, { courseId: c._id.toString() }).expect(400);
    expect(res.body.error.details.fields).toHaveProperty('courseId');
  });

  it('course không tồn tại → 400 fields.courseId', async () => {
    const res = await post(hv.token, { courseId: new Types.ObjectId().toString() }).expect(400);
    expect(res.body.error.details.fields).toHaveProperty('courseId');
  });

  describe('đổi khóa', () => {
    it('HV đổi khóa khi PENDING_PLACEMENT → 200 courseId mới + history + audit', async () => {
      const u = await student();
      const c1 = await makeCourse(t.conn);
      const c2 = await makeCourse(t.conn);
      const e = (await post(u.token, { courseId: c1._id.toString() }).expect(201)).body.data;
      const res = await patchCourse(u.token, e.id, { courseId: c2._id.toString() }).expect(200);
      expect(res.body.data.courseId).toBe(c2._id.toString());
      expect(res.body.data.history.at(-1)).toMatchObject({
        from: 'PENDING_PLACEMENT',
        to: 'PENDING_PLACEMENT',
        reason: 'COURSE_CHANGED',
      });
      expect(await t.conn.collection('audit_logs').countDocuments({ entity: 'enrollment', entityId: new Types.ObjectId(e.id) })).toBe(2);
    });

    it('S đổi khóa → 200', async () => {
      const e = await makeEnrollment(t.conn);
      const c = await makeCourse(t.conn);
      const res = await patchCourse(staff, e._id, { courseId: c._id.toString() }).expect(200);
      expect(res.body.data.courseId).toBe(c._id.toString());
    });

    it('khi WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE', async () => {
      const u = await student();
      const e = await makeEnrollment(t.conn, { studentId: u.student._id, status: EnrollmentStatus.WAITING_CLASS });
      const c = await makeCourse(t.conn);
      const res = await patchCourse(u.token, e._id, { courseId: c._id.toString() }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
    });

    it('HV đổi enrollment của người khác → 404', async () => {
      const e = await makeEnrollment(t.conn, { studentId: hv2.student._id, courseId: (await makeCourse(t.conn))._id });
      const c = await makeCourse(t.conn);
      await patchCourse(hv.token, e._id, { courseId: c._id.toString() }).expect(404);
    });

    it('id không tồn tại hoặc sai định dạng → 404', async () => {
      const c = await makeCourse(t.conn);
      await patchCourse(staff, new Types.ObjectId(), { courseId: c._id.toString() }).expect(404);
      await patchCourse(staff, 'not-an-id', { courseId: c._id.toString() }).expect(404);
    });

    it('đổi sang khóa đã có enrollment hoạt động → 409', async () => {
      const u = await student();
      const c1 = await makeCourse(t.conn);
      const c2 = await makeCourse(t.conn);
      await makeEnrollment(t.conn, { studentId: u.student._id, courseId: c2._id, status: EnrollmentStatus.ENROLLED });
      const e = (await post(u.token, { courseId: c1._id.toString() }).expect(201)).body.data;
      const res = await patchCourse(u.token, e.id, { courseId: c2._id.toString() }).expect(409);
      expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_EXISTS);
    });

    it('khóa mới ARCHIVED → 400 fields.courseId', async () => {
      const e = await makeEnrollment(t.conn);
      const c = await makeCourse(t.conn, { status: CourseStatus.ARCHIVED });
      const res = await patchCourse(staff, e._id, { courseId: c._id.toString() }).expect(400);
      expect(res.body.error.details.fields).toHaveProperty('courseId');
    });
  });

  describe('đọc', () => {
    it('GET /enrollments/me chỉ của mình, có className/courseName', async () => {
      const u = await student();
      const c = await makeCourse(t.conn, { name: 'Khóa Test Me' });
      await post(u.token, { courseId: c._id.toString() }).expect(201);
      await makeEnrollment(t.conn);
      const res = await t.http().get('/api/v1/enrollments/me').set(auth(u.token)).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ studentId: u.student._id.toString(), courseName: 'Khóa Test Me' });
    });

    it('GET /enrollments?status=… lọc, có labels', async () => {
      const s = await makeStudent(t.conn, { fullName: 'Lọc Học Viên' });
      const c = await makeCourse(t.conn);
      const e = await makeEnrollment(t.conn, { studentId: s._id, courseId: c._id, status: EnrollmentStatus.WAITING_CLASS });
      const res = await list(staff, `?status=WAITING_CLASS&studentId=${s._id}`).expect(200);
      expect(res.body.data.map((x: { id: string }) => x.id)).toEqual([e._id.toString()]);
      expect(res.body.data[0]).toMatchObject({ studentName: 'Lọc Học Viên', studentCode: s.code, courseName: c.name });
      expect(res.body.meta.total).toBe(1);
      const none = await list(manager, `?status=COMPLETED&studentId=${s._id}`).expect(200);
      expect(none.body.data).toEqual([]);
    });
  });

  describe('phân quyền', () => {
    const someId = new Types.ObjectId().toString();
    it.each([
      ['T', () => teacher],
      ['A', () => admin],
    ])('%s mọi route → 403', async (_n, tok) => {
      const token = tok();
      const body = { courseId: someId };
      await post(token, body).expect(403);
      await list(token).expect(403);
      await t.http().get('/api/v1/enrollments/me').set(auth(token)).expect(403);
      await patchCourse(token, someId, body).expect(403);
    });
    it('H GET /enrollments → 403; M/S GET /enrollments/me → 403', async () => {
      await list(hv.token).expect(403);
      await t.http().get('/api/v1/enrollments/me').set(auth(staff)).expect(403);
      await t.http().get('/api/v1/enrollments/me').set(auth(manager)).expect(403);
    });
    it('không token → 401', async () => {
      await t.http().post('/api/v1/enrollments').send({}).expect(401);
    });
  });
});
