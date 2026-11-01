import { EnrollmentStatus, LeadStatus, Role } from '@lc/shared';
import { makeCourse, makeEnrollment, makeLead, makeStudent } from '../factories';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const vn = (d: string, hhmm = '00:00') => new Date(`${d}T${hhmm}:00+07:00`);
const FROM = '2026-01-10';
const TO = '2026-01-12';

describe('FR-RPT-01 Báo cáo tuyển sinh (GET /reports/admissions)', () => {
  let t: TestApp;
  let courseA: string;
  let courseB: string;
  let nameA: string;

  const get = (token: string, qs: string) => t.http().get(`/api/v1/reports/admissions?${qs}`).set({ Authorization: `Bearer ${token}` });
  const setAt = (coll: string, id: unknown, at: Date) => t.conn.collection(coll).updateOne({ _id: id as never }, { $set: { createdAt: at } });

  beforeAll(async () => {
    t = await createTestApp();
    const a = await makeCourse(t.conn);
    const b = await makeCourse(t.conn);
    courseA = a._id.toString();
    courseB = b._id.toString();
    nameA = a.name;
    // Course A: biên ngày VN
    const l1 = await makeLead(t.conn, { interestedCourseId: a._id, status: LeadStatus.PROFILE_CREATED });
    await setAt('leads', l1._id, vn(FROM, '00:10')); // tính
    const l2 = await makeLead(t.conn, { interestedCourseId: a._id });
    await setAt('leads', l2._id, vn(TO, '23:59')); // tính
    const l3 = await makeLead(t.conn, { interestedCourseId: a._id, status: LeadStatus.PROFILE_CREATED });
    await setAt('leads', l3._id, vn('2026-01-13', '00:00')); // không tính (to+1)
    const l4 = await makeLead(t.conn, { interestedCourseId: a._id });
    await setAt('leads', l4._id, vn('2026-01-09', '23:59')); // không tính (trước from)
    // Course B: 1 lead trong khoảng
    const l5 = await makeLead(t.conn, { interestedCourseId: b._id });
    await setAt('leads', l5._id, vn('2026-01-11', '10:00'));

    const s1 = await makeStudent(t.conn);
    await setAt('students', s1._id, vn(FROM, '00:10'));
    const s2 = await makeStudent(t.conn);
    await setAt('students', s2._id, vn('2026-01-13', '00:00'));
    await makeEnrollment(t.conn, { studentId: s1._id, courseId: a._id, status: EnrollmentStatus.ENROLLED, history: [{ from: null, to: EnrollmentStatus.PENDING_PLACEMENT, at: vn(FROM, '01:00') }, { from: EnrollmentStatus.PENDING_PLACEMENT, to: EnrollmentStatus.ENROLLED, at: vn(TO, '23:00') }] });
    await makeEnrollment(t.conn, { studentId: s2._id, courseId: a._id, status: EnrollmentStatus.ENROLLED, history: [{ from: null, to: EnrollmentStatus.ENROLLED, at: vn('2026-01-13', '00:00') }] });
    await makeEnrollment(t.conn, { courseId: b._id, status: EnrollmentStatus.WAITING_CLASS });
    await makeEnrollment(t.conn, { courseId: a._id, status: EnrollmentStatus.WAITING_CLASS });
  });
  afterAll(async () => {
    await t.close();
  });

  it('FR-RPT-01 lead 00:10 VN ngày from được tính, 23:59 VN ngày to được tính, 00:00 VN ngày to+1 không', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token, `from=${FROM}&to=${TO}&courseId=${courseA}`);
    expect(r.status).toBe(200);
    expect(r.body.data.totals.leads).toBe(2);
  });

  it('FR-RPT-01 2 lead / 1 PROFILE_CREATED -> conversionRate 0.5', async () => {
    const r = await get((await loginAs(t, Role.ACADEMIC_STAFF)).token, `from=${FROM}&to=${TO}&courseId=${courseA}`);
    expect(r.body.data.totals.conversionRate).toBe(0.5);
    expect(r.body.data.totals.newProfiles).toBe(1);
  });

  it('FR-RPT-01 0 lead -> conversionRate 0, không NaN', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token, 'from=2025-01-01&to=2025-01-02');
    expect(r.status).toBe(200);
    expect(r.body.data.totals).toEqual({ leads: 0, newProfiles: 0, conversionRate: 0, enrolled: 0, waiting: 1 + 1 });
    expect(r.body.data.rows).toEqual([expect.objectContaining({ leads: 0, conversionRate: 0 }), expect.objectContaining({ leads: 0, conversionRate: 0 })]);
  });

  it('FR-RPT-01 enrolled đếm mục history to ENROLLED có at trong khoảng', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token, `from=${FROM}&to=${TO}&courseId=${courseA}`);
    expect(r.body.data.totals.enrolled).toBe(1);
  });

  it('FR-RPT-01 waiting = số WAITING_CLASS hiện tại (không phụ thuộc khoảng)', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token, `from=${FROM}&to=${TO}`);
    expect(r.body.data.totals.waiting).toBe(2);
  });

  it('FR-RPT-01 rows theo khóa', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token, `from=${FROM}&to=${TO}`);
    const rows = r.body.data.rows;
    expect(rows).toHaveLength(2);
    const a = rows.find((x: { courseId: string }) => x.courseId === courseA);
    const b = rows.find((x: { courseId: string }) => x.courseId === courseB);
    expect(a).toMatchObject({ courseName: nameA, leads: 2, newProfiles: 1, conversionRate: 0.5, enrolled: 1, waiting: 1 });
    expect(b).toMatchObject({ leads: 1, conversionRate: 0, enrolled: 0, waiting: 1 });
    expect(r.body.data.totals.leads).toBe(3);
    expect(r.body.data.totals.newProfiles).toBe(1);
  });

  it('FR-RPT-01 courseId lọc: chỉ khóa đó', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token, `from=${FROM}&to=${TO}&courseId=${courseB}`);
    expect(r.body.data.rows).toHaveLength(1);
    expect(r.body.data.totals.leads).toBe(1);
    expect(r.body.data.totals.waiting).toBe(1);
  });

  it('FR-RPT-01 from > to -> 400 fields.to', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token, 'from=2026-01-12&to=2026-01-10');
    expect(r.status).toBe(400);
    expect(r.body.error.details.fields).toHaveProperty('to');
  });

  it('FR-RPT-01 thiếu from -> 400', async () => {
    await get((await loginAs(t, Role.MANAGER)).token, `to=${TO}`).expect(400);
  });

  it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('FR-RPT-01 %s -> 403', async (role) => {
    await get((await loginAs(t, role)).token, `from=${FROM}&to=${TO}`).expect(403);
  });
});
