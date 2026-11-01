import { Types } from 'mongoose';
import { Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeCourse, makeLead, makeStudent, models } from '../factories';

describe('FR-ADM-03 FR-ADM-04 FR-ADM-05 Tạo hồ sơ từ lead', () => {
  let t: TestApp;
  let staff: string;
  let manager: string;
  let teacher: string;
  let admin: string;
  let student: string;
  let courseId: string;
  let http: ReturnType<TestApp['http']>;
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
    t.app.getHttpServer().setMaxListeners(50); // 20 concurrent requests in one test
    http = t.http();
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    manager = (await loginAs(t, Role.MANAGER)).token;
    teacher = (await loginAs(t, Role.TEACHER)).token;
    admin = (await loginAs(t, Role.ADMIN)).token;
    student = (await loginAs(t, Role.STUDENT)).token;
    courseId = (await makeCourse(t.conn))._id.toString();
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const newLead = (over: Record<string, unknown> = {}) =>
    makeLead(t.conn, { interestedCourseId: courseId as never, phone: `098${String(1_000_000 + ++seq)}`, ...over });
  const convert = (token: string, id: string, qs = '') =>
    http.post(`/api/v1/leads/${id}/convert${qs}`).set(auth(token)).send();
  const m = () => models(t.conn);

  it('tạo student code HV2026xxxxx, user STUDENT, enrollment PENDING_PLACEMENT, lead PROFILE_CREATED', async () => {
    const lead = await newLead({ email: 'convert@mail.com' });
    const res = await convert(staff, lead._id.toString()).expect(201);
    const { student, tempPassword, enrollmentId } = res.body.data;
    expect(student.code).toMatch(/^HV2026\d{5}$/);
    expect(student).toMatchObject({ fullName: lead.fullName, phone: lead.phone, email: 'convert@mail.com', leadId: lead._id.toString(), status: 'ACTIVE' });
    expect(tempPassword).toBeTruthy();

    const user = await m().User.findOne({ username: student.code }).lean();
    expect(user).toMatchObject({ role: 'STUDENT', mustChangePassword: true });
    expect(user?._id.toString()).toBe(student.userId);
    const enr = await m().Enrollment.findOne({ studentId: student.id }).lean();
    expect(enr).toMatchObject({ status: 'PENDING_PLACEMENT' });
    expect(enr?._id.toString()).toBe(enrollmentId);
    expect(enr?.courseId.toString()).toBe(courseId);
    const stored = await m().Lead.findById(lead._id).lean();
    expect(stored).toMatchObject({ status: 'PROFILE_CREATED' });
    expect(stored?.studentId?.toString()).toBe(student.id);
  });

  it('email lead rỗng → student email null', async () => {
    const lead = await newLead();
    const res = await convert(manager, lead._id.toString()).expect(201);
    expect(res.body.data.student.email).toBeNull();
  });

  it('SĐT trùng student khác → 409 DUPLICATE_PERSON; ?force=true → 201', async () => {
    const other = await makeStudent(t.conn);
    const lead = await newLead({ phone: other.phone });
    const res = await convert(staff, lead._id.toString()).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_PERSON');
    expect(res.body.error.details.duplicates[0]).toMatchObject({ kind: 'STUDENT', matchedOn: ['phone'] });
    await convert(staff, lead._id.toString(), '?force=true').expect(201);
    expect(await m().Student.countDocuments({ phone: other.phone })).toBe(2);
  });

  it('email trùng student khác (SĐT khác) → 409 DUPLICATE_PERSON matchedOn email', async () => {
    const other = await makeStudent(t.conn, { email: 'dup-only@mail.com' });
    const lead = await newLead({ email: 'Dup-Only@Mail.com' });
    const res = await convert(staff, lead._id.toString()).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_PERSON');
    expect(res.body.error.details.duplicates).toEqual([
      expect.objectContaining({ kind: 'STUDENT', id: other._id.toString(), matchedOn: ['email'] }),
    ]);
  });

  it('SĐT trùng lead khác chưa hủy → 409 DUPLICATE_PERSON; lead đã hủy thì không tính', async () => {
    const phone = `097${String(2_000_000 + ++seq)}`;
    const other = await newLead({ phone });
    const lead = await newLead({ phone });
    const res = await convert(staff, lead._id.toString()).expect(409);
    expect(res.body.error.details.duplicates[0]).toMatchObject({ kind: 'LEAD', id: other._id.toString() });
    await m().Lead.updateOne({ _id: other._id }, { status: 'CANCELLED' });
    await convert(staff, lead._id.toString()).expect(201);
  });

  it('lead không tự trùng với chính nó (D10)', async () => {
    const lead = await newLead({ email: 'self@mail.com' });
    await convert(staff, lead._id.toString()).expect(201);
  });

  it('lead không tồn tại → 404 LEAD_NOT_FOUND', async () => {
    const res = await convert(staff, '64b000000000000000000000').expect(404);
    expect(res.body.error.code).toBe('LEAD_NOT_FOUND');
  });

  it('lead CANCELLED → 422 INVALID_STATUS_TRANSITION', async () => {
    const lead = await newLead({ status: 'CANCELLED' });
    const res = await convert(staff, lead._id.toString()).expect(422);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('convert lần hai → 409 PROFILE_EXISTS', async () => {
    const lead = await newLead();
    await convert(staff, lead._id.toString()).expect(201);
    const res = await convert(staff, lead._id.toString()).expect(409);
    expect(res.body.error.code).toBe('PROFILE_EXISTS');
  });

  it('2 convert song song cùng lead → 1×201, 1×409 PROFILE_EXISTS, đúng 1 student', async () => {
    const lead = await newLead();
    const id = lead._id.toString();
    const results = await Promise.all([convert(staff, id), convert(manager, id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe('PROFILE_EXISTS');
    expect(await m().Student.countDocuments({ leadId: lead._id })).toBe(1);
    expect(await m().User.countDocuments({ username: results.find((r) => r.status === 201)?.body.data.student.code })).toBe(1);
  });

  it('20 convert song song 20 lead khác nhau → 20 mã khác nhau', async () => {
    const leads = await Promise.all(Array.from({ length: 20 }, () => newLead()));
    const results = await Promise.all(leads.map((l) => convert(staff, l._id.toString())));
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    expect(new Set(results.map((r) => r.body.data.student.code)).size).toBe(20);
  });

  it('audit_logs có entity student action create', async () => {
    const lead = await newLead();
    const res = await convert(staff, lead._id.toString()).expect(201);
    const log = await t.conn.collection('audit_logs').findOne({ entity: 'student', action: 'create', entityId: new Types.ObjectId(res.body.data.student.id) });
    expect(log).toBeTruthy();
  });

  it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('%s → 403', async (role) => {
    const lead = await newLead();
    const token = role === Role.TEACHER ? teacher : role === Role.STUDENT ? student : admin;
    await convert(token, lead._id.toString()).expect(403);
  });
});
