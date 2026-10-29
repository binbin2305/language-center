import { AttendanceStatus, ClassStatus, EnrollmentStatus, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import {
  makeAttendance,
  makeClass,
  makeCourse,
  makeEnrollment,
  makeSession,
  makeStudent,
  makeTeacher,
} from '../factories';

describe('FR-CLS-05 Tìm lớp', () => {
  let t: TestApp;
  let manager: { token: string };
  let admin: { token: string };

  beforeAll(async () => {
    t = await createTestApp();
    manager = await loginAs(t, Role.MANAGER);
    admin = await loginAs(t, Role.ADMIN);
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (token: string, qs = '') =>
    t.http().get(`/api/v1/classes${qs}`).set(auth(token));
  const ids = (res: { body: { data: Array<{ id: string }> } }) => res.body.data.map((c) => c.id);

  describe('lọc theo khóa, trình độ, còn chỗ', () => {
    it('courseId+level+hasSeat=true loại lớp 20/20, lớp FINISHED, lớp INACTIVE', async () => {
      const course = await makeCourse(t.conn);
      const base = { courseId: course._id, level: 'A1', maxCapacity: 20 };
      const open = await makeClass(t.conn, { ...base, currentSize: 5, status: ClassStatus.ONGOING });
      const planned = await makeClass(t.conn, { ...base, currentSize: 19 });
      const full = await makeClass(t.conn, { ...base, currentSize: 20, status: ClassStatus.ONGOING });
      const finished = await makeClass(t.conn, { ...base, currentSize: 1, status: ClassStatus.FINISHED });
      const inactive = await makeClass(t.conn, { ...base, currentSize: 1, status: ClassStatus.INACTIVE });
      const otherLevel = await makeClass(t.conn, { ...base, level: 'A2', currentSize: 1 });
      const res = await list(
        manager.token,
        `?courseId=${course._id}&level=A1&hasSeat=true`,
      ).expect(200);
      expect(ids(res).sort()).toEqual([String(open._id), String(planned._id)].sort());
      expect(ids(res)).not.toContain(String(full._id));
      expect(ids(res)).not.toContain(String(finished._id));
      expect(ids(res)).not.toContain(String(inactive._id));
      expect(ids(res)).not.toContain(String(otherLevel._id));
      expect(res.body.meta).toMatchObject({ page: 1, total: 2 });
    });

    it('hasSeat=true chỉ PLANNED|ONGOING, kể cả khi status=FINISHED được lọc cùng', async () => {
      const course = await makeCourse(t.conn);
      await makeClass(t.conn, { courseId: course._id, currentSize: 1, status: ClassStatus.FINISHED });
      const res = await list(
        manager.token,
        `?courseId=${course._id}&hasSeat=true&status=FINISHED`,
      ).expect(200);
      expect(res.body.data).toEqual([]);
    });

    it('ADMIN bị 403', async () => {
      await list(admin.token).expect(403);
    });
  });

  describe('phạm vi giáo viên', () => {
    it('chỉ lớp mình dạy hoặc trợ giảng; GET /classes/:id lớp khác → 404', async () => {
      const teacher = await loginAs(t, Role.TEACHER);
      const other = await makeTeacher(t.conn);
      const main = await makeClass(t.conn, { teacherId: teacher.user._id });
      const assist = await makeClass(t.conn, { teacherId: other._id, assistantTeacherId: teacher.user._id });
      const foreign = await makeClass(t.conn, { teacherId: other._id });
      const res = await list(teacher.token).expect(200);
      expect(ids(res).sort()).toEqual([String(main._id), String(assist._id)].sort());
      await t.http().get(`/api/v1/classes/${main._id}`).set(auth(teacher.token)).expect(200);
      await t.http().get(`/api/v1/classes/${assist._id}`).set(auth(teacher.token)).expect(200);
      await t.http().get(`/api/v1/classes/${foreign._id}`).set(auth(teacher.token)).expect(404);
    });

    it('teacherId của người khác chỉ thu hẹp, không mở rộng phạm vi', async () => {
      const teacher = await loginAs(t, Role.TEACHER);
      const other = await makeTeacher(t.conn);
      await makeClass(t.conn, { teacherId: other._id });
      const mine = await makeClass(t.conn, { teacherId: teacher.user._id });
      const res = await list(teacher.token, `?teacherId=${other._id}`).expect(200);
      expect(res.body.data).toEqual([]);
      const res2 = await list(teacher.token, `?teacherId=${teacher.user._id}`).expect(200);
      expect(ids(res2)).toEqual([String(mine._id)]);
    });
  });

  describe('phạm vi học viên', () => {
    it('mặc định chỉ lớp ENROLLED hiện tại; ?includePast=true thêm TRANSFERRED/COMPLETED; lớp không liên quan → 404', async () => {
      const student = await makeStudent(t.conn);
      const login = await loginAs(t, Role.STUDENT, { studentId: student._id });
      const cur = await makeClass(t.conn);
      const moved = await makeClass(t.conn);
      const done = await makeClass(t.conn);
      const unrelated = await makeClass(t.conn);
      const enr = (classId: unknown, status: EnrollmentStatus) =>
        makeEnrollment(t.conn, { studentId: student._id, classId: classId as never, status });
      await enr(cur._id, EnrollmentStatus.ENROLLED);
      await enr(moved._id, EnrollmentStatus.TRANSFERRED);
      await enr(done._id, EnrollmentStatus.COMPLETED);

      const res = await list(login.token).expect(200);
      expect(ids(res)).toEqual([String(cur._id)]);
      const past = await list(login.token, '?includePast=true').expect(200);
      expect(ids(past).sort()).toEqual([cur._id, moved._id, done._id].map(String).sort());
      await t.http().get(`/api/v1/classes/${unrelated._id}`).set(auth(login.token)).expect(404);
      await t.http().get(`/api/v1/classes/${cur._id}`).set(auth(login.token)).expect(200);
    });

    it('includePast bị bỏ qua với vai trò khác HV', async () => {
      const teacher = await loginAs(t, Role.TEACHER);
      const mine = await makeClass(t.conn, { teacherId: teacher.user._id });
      const res = await list(teacher.token, '?includePast=true').expect(200);
      expect(ids(res)).toEqual([String(mine._id)]);
    });
  });

  describe('danh sách học viên của lớp', () => {
    it('trả HV ENROLLED, absenceRate 0.25 & warning true khi threshold 0.2 (2 EXCUSED+UNEXCUSED / 8 bản ghi)', async () => {
      const teacher = await loginAs(t, Role.TEACHER);
      const klass = await makeClass(t.conn, { teacherId: teacher.user._id });
      const s1 = await makeStudent(t.conn, { fullName: 'An Nguyễn' });
      const s2 = await makeStudent(t.conn, { fullName: 'Bình Trần' });
      const gone = await makeStudent(t.conn);
      const e1 = await makeEnrollment(t.conn, { studentId: s1._id, classId: klass._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: s2._id, classId: klass._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: gone._id, classId: klass._id, status: EnrollmentStatus.TRANSFERRED });
      const statuses = [
        ...Array(6).fill(AttendanceStatus.PRESENT),
        AttendanceStatus.EXCUSED,
        AttendanceStatus.UNEXCUSED,
      ];
      for (const status of statuses) {
        const session = await makeSession(t.conn, { classId: klass._id });
        await makeAttendance(t.conn, { sessionId: session._id, studentId: s1._id, enrollmentId: e1._id, status });
      }
      const res = await t
        .http()
        .get(`/api/v1/classes/${klass._id}/students`)
        .set(auth(teacher.token))
        .expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, total: 2 });
      expect(res.body.data).toHaveLength(2);
      const row1 = res.body.data.find((r: { studentId: string }) => r.studentId === String(s1._id));
      expect(row1).toMatchObject({
        enrollmentId: String(e1._id),
        studentCode: s1.code,
        fullName: 'An Nguyễn',
        absenceRate: 0.25,
        warning: true,
      });
      const row2 = res.body.data.find((r: { studentId: string }) => r.studentId === String(s2._id));
      expect(row2).toMatchObject({ absenceRate: 0, warning: false });

      const page = await t
        .http()
        .get(`/api/v1/classes/${klass._id}/students?page=2&limit=1`)
        .set(auth(manager.token))
        .expect(200);
      expect(page.body.meta).toMatchObject({ page: 2, limit: 1, total: 2 });
      expect(page.body.data).toHaveLength(1);
    });

    it('GV lớp khác → 404', async () => {
      const teacher = await loginAs(t, Role.TEACHER);
      const klass = await makeClass(t.conn);
      await t.http().get(`/api/v1/classes/${klass._id}/students`).set(auth(teacher.token)).expect(404);
    });

    it('HV → 403', async () => {
      const student = await makeStudent(t.conn);
      const login = await loginAs(t, Role.STUDENT, { studentId: student._id });
      const klass = await makeClass(t.conn);
      await makeEnrollment(t.conn, { studentId: student._id, classId: klass._id, status: EnrollmentStatus.ENROLLED });
      await t.http().get(`/api/v1/classes/${klass._id}/students`).set(auth(login.token)).expect(403);
    });
  });
});
