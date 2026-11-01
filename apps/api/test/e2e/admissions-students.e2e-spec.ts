import { Types } from 'mongoose';
import { AttendanceStatus, EnrollmentStatus, Role, StudentStatus } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { Models } from '../../src/database/models';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeAttendance, makeClass, makeCourse, makeEnrollment, makeSession, makeStudent } from '../factories';

describe('FR-STU-01 FR-STU-02 Học viên', () => {
  let t: TestApp;
  let manager: string;
  let staff: string;
  let admin: string;
  let teacher: { token: string; id: Types.ObjectId };
  let assistant: { token: string; id: Types.ObjectId };
  let outsider: string;
  let courseA: Types.ObjectId;
  let courseB: Types.ObjectId;
  let classA: Types.ObjectId;
  let classB: Types.ObjectId;
  let hvA: Awaited<ReturnType<typeof makeStudent>>;
  let hvB: Awaited<ReturnType<typeof makeStudent>>;
  let hvC: Awaited<ReturnType<typeof makeStudent>>;
  let hvOther: Awaited<ReturnType<typeof makeStudent>>;
  let hvDeleted: Awaited<ReturnType<typeof makeStudent>>;
  let hvToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    admin = (await loginAs(t, Role.ADMIN)).token;
    const tl = await loginAs(t, Role.TEACHER);
    teacher = { token: tl.token, id: tl.user._id };
    const al = await loginAs(t, Role.TEACHER);
    assistant = { token: al.token, id: al.user._id };
    outsider = (await loginAs(t, Role.TEACHER)).token;
    courseA = (await makeCourse(t.conn))._id;
    courseB = (await makeCourse(t.conn))._id;
    classA = (await makeClass(t.conn, { courseId: courseA, teacherId: teacher.id, assistantTeacherId: assistant.id }))._id;
    classB = (await makeClass(t.conn, { courseId: courseB }))._id;

    hvA = await makeStudent(t.conn, { fullName: 'Nguyễn Văn A', phone: '0912345601', email: 'a.nguyen@mail.com', code: 'HV2026A0001', address: 'Hà Nội' });
    hvB = await makeStudent(t.conn, { fullName: 'Đặng Thị B', phone: '0912345602', email: 'b@mail.com', code: 'HV2026A0002' });
    hvC = await makeStudent(t.conn, { fullName: 'Lê C', code: 'HV2026A0003', status: StudentStatus.DROPPED });
    hvOther = await makeStudent(t.conn, { fullName: 'Phạm Khác', code: 'HV2026A0004' });
    hvDeleted = await makeStudent(t.conn, { fullName: 'Nguyễn Đã Xóa', code: 'HV2026A0005', deletedAt: new Date() });
    // A: ENROLLED in classA; B: COMPLETED in classA; C: CANCELLED in classA (not visible to teacher); other in classB
    await makeEnrollment(t.conn, { studentId: hvA._id, courseId: courseA, classId: classA, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: hvA._id, courseId: courseB, classId: classB, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: hvB._id, courseId: courseA, classId: classA, status: EnrollmentStatus.COMPLETED });
    await makeEnrollment(t.conn, { studentId: hvC._id, courseId: courseA, classId: classA, status: EnrollmentStatus.CANCELLED });
    await makeEnrollment(t.conn, { studentId: hvOther._id, courseId: courseB, classId: classB, status: EnrollmentStatus.ENROLLED });
    hvToken = (await loginAs(t, Role.STUDENT, { studentId: hvA._id })).token;
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string, qs = '') => t.http().get(`/api/v1/students${qs}`).set(auth(token));
  const detail = (token: string, id: string | Types.ObjectId) => t.http().get(`/api/v1/students/${id}`).set(auth(token));
  const ids = (res: { body: { data: Array<{ id: string }> } }) => res.body.data.map((s) => s.id);

  describe('tìm kiếm', () => {
    it('q "nguyen van" khớp "Nguyễn Văn A"', async () => {
      const res = await list(manager, '?q=nguyen%20van').expect(200);
      expect(ids(res)).toEqual([hvA._id.toString()]);
    });
    it('q "dang" khớp "Đặng Thị B"; chữ hoa có dấu cũng khớp', async () => {
      expect(ids(await list(staff, '?q=dang').expect(200))).toEqual([hvB._id.toString()]);
      expect(ids(await list(staff, `?q=${encodeURIComponent('ĐẶNG')}`).expect(200))).toEqual([hvB._id.toString()]);
    });
    it('q theo code, phone, email', async () => {
      expect(ids(await list(manager, '?q=HV2026A0002').expect(200))).toEqual([hvB._id.toString()]);
      expect(ids(await list(manager, '?q=hv2026a0002').expect(200))).toEqual([hvB._id.toString()]);
      expect(ids(await list(manager, '?q=0912345601').expect(200))).toEqual([hvA._id.toString()]);
      expect(ids(await list(manager, `?q=${encodeURIComponent('+84912345601')}`).expect(200))).toEqual([hvA._id.toString()]);
      expect(ids(await list(manager, `?q=${encodeURIComponent('0912 345.601')}`).expect(200))).toEqual([hvA._id.toString()]);
      expect(ids(await list(manager, '?q=A.Nguyen@').expect(200))).toEqual([hvA._id.toString()]);
    });
    it('q "+84(" → 200 rỗng, không 500', async () => {
      const res = await list(manager, `?q=${encodeURIComponent('+84(')}`).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
      await list(manager, `?q=${encodeURIComponent('.*[(')}`).expect(200);
    });
    it('phân trang limit=2: meta.total đúng, không có HV xóa mềm', async () => {
      const res = await list(manager, '?limit=2&sort=code').expect(200);
      expect(res.body.data).toHaveLength(2);
      const all = await list(manager, '?limit=100').expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: all.body.meta.total });
      expect(ids(all)).not.toContain(hvDeleted._id.toString());
    });
    it('sort ngoài danh sách cho phép bị bỏ qua (không lỗi)', async () => {
      await list(manager, '?sort=passwordHash').expect(200);
    });
    it('lọc status, classId, courseId', async () => {
      const inactive = await list(manager, `?status=${StudentStatus.DROPPED}&q=HV2026A`).expect(200);
      expect(ids(inactive)).toEqual([hvC._id.toString()]);
      const byClass = await list(manager, `?classId=${classB}`).expect(200);
      expect(ids(byClass).sort()).toEqual([hvA._id.toString(), hvOther._id.toString()].sort());
      const byCourse = await list(manager, `?courseId=${courseA}`).expect(200);
      // R17: CANCELLED enrollment (hvC) is excluded from class/course filters.
      expect(ids(byCourse).sort()).toEqual([hvA._id, hvB._id].map(String).sort());
    });
  });

  describe('giáo viên', () => {
    it('chỉ thấy HV ENROLLED/COMPLETED ở lớp mình (kể cả trợ giảng)', async () => {
      for (const tok of [teacher.token, assistant.token]) {
        const res = await list(tok).expect(200);
        expect(ids(res).sort()).toEqual([hvA._id.toString(), hvB._id.toString()].sort());
        expect(res.body.meta.total).toBe(2);
      }
      expect((await list(outsider).expect(200)).body.data).toEqual([]);
    });
    it('response GV chỉ có trường Brief, không email/address/summary', async () => {
      const res = await list(teacher.token, '?q=nguyen').expect(200);
      expect(Object.keys(res.body.data[0]).sort()).toEqual(['code', 'currentClasses', 'dob', 'fullName', 'id', 'phone', 'status']);
      const d = await detail(teacher.token, hvA._id).expect(200);
      expect(d.body.data.email).toBeUndefined();
      expect(d.body.data.address).toBeUndefined();
      expect(d.body.data.summary).toBeUndefined();
      expect(d.body.data.dob).toBe('2005-01-01');
    });
    it('detail GV chỉ chứa enrollments ở lớp của GV', async () => {
      const d = await detail(teacher.token, hvA._id).expect(200);
      expect(d.body.data.enrollments).toHaveLength(1);
      expect(d.body.data.enrollments[0].classId).toBe(classA.toString());
    });
    it('xem HV khác (không thuộc lớp, hoặc CANCELLED) → 404', async () => {
      await detail(teacher.token, hvOther._id).expect(404);
      await detail(teacher.token, hvC._id).expect(404);
      await detail(outsider, hvA._id).expect(404);
    });
    it('classId/courseId ngoài phạm vi GV → rỗng (không lộ ghi danh nơi khác)', async () => {
      expect((await list(teacher.token, `?classId=${classB}`).expect(200)).body.data).toEqual([]);
      expect((await list(teacher.token, `?courseId=${courseB}`).expect(200)).body.data).toEqual([]);
      expect(ids(await list(teacher.token, `?courseId=${courseA}`).expect(200)).sort()).toEqual(
        [hvA._id, hvB._id].map(String).sort(),
      );
    });
    it('GV không dò được email qua q', async () => {
      expect((await list(teacher.token, '?q=a.nguyen@').expect(200)).body.data).toEqual([]);
    });
  });

  describe('chi tiết', () => {
    it('M/S: detail có enrollments và summary (D7)', async () => {
      await makeAttendanceFor(hvA._id, AttendanceStatus.PRESENT);
      await makeAttendanceFor(hvA._id, AttendanceStatus.LATE);
      await makeAttendanceFor(hvA._id, AttendanceStatus.UNEXCUSED);
      await makeAttendanceFor(hvA._id, AttendanceStatus.EXCUSED);
      for (const tok of [manager, staff]) {
        const res = await detail(tok, hvA._id).expect(200);
        expect(res.body.data).toMatchObject({ id: hvA._id.toString(), email: 'a.nguyen@mail.com', address: 'Hà Nội' });
        expect(res.body.data.enrollments).toHaveLength(2);
        expect(res.body.data.summary).toEqual({ attendanceRate: 0.5, averageScore: null, outstandingBalance: 0 });
        expect(res.body.data.documents).toEqual([]);
      }
    });
    it('chưa có điểm danh → attendanceRate null', async () => {
      const res = await detail(manager, hvB._id).expect(200);
      expect(res.body.data.summary.attendanceRate).toBeNull();
    });
    it('deletedAt ≠ null → 404 (M cũng vậy); id sai định dạng/không tồn tại → 404', async () => {
      await detail(manager, hvDeleted._id).expect(404);
      await detail(manager, 'abc').expect(404);
      await detail(manager, new Types.ObjectId()).expect(404);
    });
  });

  describe('học viên', () => {
    it('GET /students/:id chính mình → 200, người khác → 404', async () => {
      const res = await detail(hvToken, hvA._id).expect(200);
      expect(res.body.data.id).toBe(hvA._id.toString());
      await detail(hvToken, hvB._id).expect(404);
    });
    it('GET /students/me → 200 (route trước :id)', async () => {
      const res = await t.http().get('/api/v1/students/me').set(auth(hvToken)).expect(200);
      expect(res.body.data.id).toBe(hvA._id.toString());
      expect(res.body.data.summary).toBeDefined();
    });
    it('HV không được liệt kê; M/S/T không dùng /me → 403', async () => {
      await list(hvToken).expect(403);
      await t.http().get('/api/v1/students/me').set(auth(manager)).expect(403);
      await t.http().get('/api/v1/students/me').set(auth(teacher.token)).expect(403);
    });
  });

  it('ADMIN → 403 trên mọi route', async () => {
    await list(admin).expect(403);
    await detail(admin, hvA._id).expect(403);
    await t.http().get('/api/v1/students/me').set(auth(admin)).expect(403);
  });
  it('không đăng nhập → 401', async () => {
    await t.http().get('/api/v1/students').expect(401);
  });

  async function makeAttendanceFor(studentId: Types.ObjectId, status: AttendanceStatus) {
    const session = await makeSession(t.conn, { classId: classA });
    const enrollment = await t.conn.model(Models.Enrollment).findOne({ studentId, classId: classA });
    await makeAttendance(t.conn, { sessionId: session._id, studentId, status, enrollmentId: enrollment?._id });
  }
});
