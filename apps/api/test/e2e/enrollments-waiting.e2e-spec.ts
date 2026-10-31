import { EnrollmentStatus, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeCourse, makeEnrollment } from '../factories';

describe('FR-CLS-11 Danh sách chờ xếp lớp', () => {
  let t: TestApp;
  let manager: string;
  let staff: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (token: string, qs = '') => t.http().get(`/api/v1/enrollments/waiting${qs}`).set(auth(token));

  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  it('sắp theo waitingSince tăng dần, waitingDays = 16 khi chờ từ 2025-12-20 (VN)', async () => {
    const c = await makeCourse(t.conn);
    const late = await makeEnrollment(t.conn, { courseId: c._id, status: EnrollmentStatus.WAITING_CLASS, waitingSince: new Date('2026-01-03T02:00:00Z') });
    const early = await makeEnrollment(t.conn, { courseId: c._id, status: EnrollmentStatus.WAITING_CLASS, waitingSince: new Date('2025-12-20T02:00:00Z') });
    await makeEnrollment(t.conn, { courseId: c._id, status: EnrollmentStatus.ENROLLED });
    const res = await get(manager, `?courseId=${c._id}`).expect(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([early._id.toString(), late._id.toString()]);
    expect(res.body.data[0].waitingDays).toBe(16);
    expect(res.body.data[1].waitingDays).toBe(2);
    expect(res.body.meta.total).toBe(2);
  });

  it('lọc courseId', async () => {
    const c1 = await makeCourse(t.conn);
    const c2 = await makeCourse(t.conn);
    await makeEnrollment(t.conn, { courseId: c1._id, status: EnrollmentStatus.WAITING_CLASS, waitingSince: new Date('2026-01-01T02:00:00Z') });
    const e2 = await makeEnrollment(t.conn, { courseId: c2._id, status: EnrollmentStatus.WAITING_CLASS, waitingSince: new Date('2026-01-01T02:00:00Z') });
    const res = await get(staff, `?courseId=${c2._id}`).expect(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual([e2._id.toString()]);
  });

  it('T, H, A → 403', async () => {
    for (const role of [Role.TEACHER, Role.STUDENT, Role.ADMIN]) {
      const { token } = await loginAs(t, role);
      await get(token).expect(403);
    }
  });
});
