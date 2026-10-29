import { Types } from 'mongoose';
import { CourseStatus, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeCourse, makeLead, makeStudent } from '../factories';
import { Models } from '../../src/database/models';
import { Lead } from '../../src/database/schemas/lead.schema';

describe('FR-ADM-01/02/08 Lead', () => {
  let t: TestApp;
  let staff: string;
  let manager: string;
  let courseId: string;
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    manager = (await loginAs(t, Role.MANAGER)).token;
    courseId = (await makeCourse(t.conn))._id.toString();
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const phone = () => `09${String(30_000_000 + ++seq)}`;
  const body = (over: Record<string, unknown> = {}) => ({
    fullName: 'Nguyễn Văn A',
    dob: '2005-03-04',
    gender: 'MALE',
    phone: phone(),
    interestedCourseId: courseId,
    ...over,
  });
  const post = (token: string, b: Record<string, unknown>, qs = '') =>
    t.http().post(`/api/v1/leads${qs}`).set(auth(token)).send(b);

  it('tạo lead hợp lệ → 201, dob giữ nguyên ngày, status NEW', async () => {
    const res = await post(staff, body({ email: 'New@Mail.com' })).expect(201);
    expect(res.body.data).toMatchObject({ status: 'NEW', dob: '2005-03-04', email: 'new@mail.com', studentId: null });
    expect(res.body.data.deletedAt).toBeUndefined();
    const got = await t.http().get(`/api/v1/leads/${res.body.data.id}`).set(auth(manager)).expect(200);
    expect(got.body.data.id).toBe(res.body.data.id);
  });

  it.each(['fullName', 'dob', 'gender', 'phone', 'interestedCourseId'])('thiếu %s → 400 VALIDATION_FAILED theo trường', async (field) => {
    const b = body();
    delete (b as Record<string, unknown>)[field];
    const res = await post(staff, b).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields[field]).toBeDefined();
  });

  it('phone "+84912345678" lưu "0912345678"', async () => {
    const res = await post(staff, body({ phone: '+84912345678' })).expect(201);
    expect(res.body.data.phone).toBe('0912345678');
    const stored = await t.conn.model<Lead>(Models.Lead).findById(res.body.data.id).lean();
    expect(stored?.phone).toBe('0912345678');
  });

  it('SĐT trùng lead NEW khác → 409 DUPLICATE_PERSON kind LEAD matchedOn phone', async () => {
    const p = phone();
    const first = await post(staff, body({ phone: p })).expect(201);
    const res = await post(staff, body({ phone: p })).expect(409);
    expect(res.body.error.code).toBe('DUPLICATE_PERSON');
    expect(res.body.error.details.duplicates).toHaveLength(1);
    expect(res.body.error.details.duplicates[0]).toMatchObject({
      kind: 'LEAD',
      id: first.body.data.id,
      phone: p,
      matchedOn: ['phone'],
    });
  });

  it('SĐT trùng student → kind STUDENT kèm code; student xóa mềm không tính', async () => {
    const p = phone();
    const s = await makeStudent(t.conn, { phone: p });
    const res = await post(staff, body({ phone: p })).expect(409);
    expect(res.body.error.details.duplicates[0]).toMatchObject({
      kind: 'STUDENT',
      id: s._id.toString(),
      code: s.code,
      matchedOn: ['phone'],
    });
    const p2 = phone();
    await makeStudent(t.conn, { phone: p2, deletedAt: new Date() });
    await post(staff, body({ phone: p2 })).expect(201);
  });

  it('trùng cả lead lẫn student → 2 phần tử', async () => {
    const p = phone();
    await makeLead(t.conn, { phone: p });
    await makeStudent(t.conn, { phone: p });
    const res = await post(staff, body({ phone: p })).expect(409);
    const kinds = res.body.error.details.duplicates.map((d: { kind: string }) => d.kind).sort();
    expect(kinds).toEqual(['LEAD', 'STUDENT']);
  });

  it('?force=true bỏ qua cảnh báo trùng → 201', async () => {
    const p = phone();
    await makeLead(t.conn, { phone: p });
    await post(staff, body({ phone: p }), '?force=true').expect(201);
  });

  it('email "A@X.VN" trùng "a@x.vn" → 409 matchedOn email', async () => {
    await makeLead(t.conn, { email: 'a@x.vn' });
    const res = await post(staff, body({ email: 'A@X.VN' })).expect(409);
    expect(res.body.error.details.duplicates[0]).toMatchObject({ kind: 'LEAD', email: 'a@x.vn', matchedOn: ['email'] });
  });

  it('trùng cả phone và email cùng một bản ghi → matchedOn có cả hai', async () => {
    const p = phone();
    await makeLead(t.conn, { phone: p, email: 'both@x.vn' });
    const res = await post(staff, body({ phone: p, email: 'both@x.vn' })).expect(409);
    expect(res.body.error.details.duplicates).toHaveLength(1);
    expect(res.body.error.details.duplicates[0].matchedOn.sort()).toEqual(['email', 'phone']);
  });

  it('lead CANCELLED cùng SĐT → không tính trùng', async () => {
    const p = phone();
    await makeLead(t.conn, { phone: p, status: 'CANCELLED' });
    await post(staff, body({ phone: p })).expect(201);
  });

  it('course ARCHIVED → 400 fields.interestedCourseId; course không tồn tại → 400', async () => {
    const archived = await makeCourse(t.conn, { status: CourseStatus.ARCHIVED });
    const r1 = await post(staff, body({ interestedCourseId: archived._id.toString() })).expect(400);
    expect(r1.body.error.details.fields.interestedCourseId).toBeDefined();
    const r2 = await post(staff, body({ interestedCourseId: new Types.ObjectId().toString() })).expect(400);
    expect(r2.body.error.details.fields.interestedCourseId).toBeDefined();
  });

  it('lọc ?status&courseId&from&to theo ngày VN của createdAt', async () => {
    const c = (await makeCourse(t.conn))._id.toString();
    t.clock.set(new Date('2026-01-05T02:00:00Z')); // 05/01 VN
    const a = await post(staff, body({ interestedCourseId: c })).expect(201);
    t.clock.set(new Date('2026-01-05T17:30:00Z')); // 06/01 00:30 VN
    const lateToken = (await loginAs(t, Role.ACADEMIC_STAFF)).token; // access tokens expire after 15 minutes
    const b = await post(lateToken, body({ interestedCourseId: c })).expect(201);
    t.clock.set(new Date('2026-01-05T02:00:00Z'));
    const q = (qs: string) => t.http().get(`/api/v1/leads?courseId=${c}&${qs}`).set(auth(staff)).expect(200);

    const day5 = await q('status=NEW&from=2026-01-05&to=2026-01-05');
    expect(day5.body.data.map((l: { id: string }) => l.id)).toEqual([a.body.data.id]);
    const day6 = await q('from=2026-01-06&to=2026-01-06');
    expect(day6.body.data.map((l: { id: string }) => l.id)).toEqual([b.body.data.id]);
    const both = await q('from=2026-01-05&to=2026-01-06');
    expect(both.body.meta.total).toBe(2);
    const none = await q('status=CANCELLED');
    expect(none.body.data).toHaveLength(0);
  });

  it('q tìm theo tên không dấu / SĐT và không lỗi với ký tự regex', async () => {
    const p = phone();
    await post(staff, body({ fullName: 'Đặng Quốc Zed', phone: p })).expect(201);
    const byName = await t.http().get('/api/v1/leads?q=dang quoc zed').set(auth(staff)).expect(200);
    expect(byName.body.data.length).toBeGreaterThanOrEqual(1);
    const byPhone = await t.http().get(`/api/v1/leads?q=${p}`).set(auth(staff)).expect(200);
    expect(byPhone.body.data).toHaveLength(1);
    const weird = await t.http().get('/api/v1/leads?q=%2B84(').set(auth(staff)).expect(200);
    expect(weird.body.data).toHaveLength(0);
  });

  it('PATCH cập nhật lead; id lạ → 404', async () => {
    const l = await makeLead(t.conn);
    const res = await t.http().patch(`/api/v1/leads/${l._id}`).set(auth(staff)).send({ note: 'gọi lại', phone: '+84987000111' }).expect(200);
    expect(res.body.data).toMatchObject({ note: 'gọi lại', phone: '0987000111' });
    await t.http().patch(`/api/v1/leads/${new Types.ObjectId()}`).set(auth(staff)).send({ note: 'x' }).expect(404);
    await t.http().get('/api/v1/leads/not-an-id').set(auth(staff)).expect(404);
  });

  it('cancel → CANCELLED; cancel lần hai → 422 INVALID_STATUS_TRANSITION', async () => {
    const l = await makeLead(t.conn);
    const res = await t.http().post(`/api/v1/leads/${l._id}/cancel`).set(auth(manager)).send({ reason: 'không học nữa' }).expect(200);
    expect(res.body.data.status).toBe('CANCELLED');
    const again = await t.http().post(`/api/v1/leads/${l._id}/cancel`).set(auth(manager)).send({}).expect(422);
    expect(again.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    const conv = await makeLead(t.conn, { status: 'PROFILE_CREATED' });
    await t.http().post(`/api/v1/leads/${conv._id}/cancel`).set(auth(manager)).send({}).expect(422);
  });

  it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('%s mọi route leads → 403', async (role) => {
    const { token } = await loginAs(t, role);
    const l = await makeLead(t.conn);
    await t.http().post('/api/v1/leads').set(auth(token)).send(body()).expect(403);
    await t.http().get('/api/v1/leads').set(auth(token)).expect(403);
    await t.http().get(`/api/v1/leads/${l._id}`).set(auth(token)).expect(403);
    await t.http().patch(`/api/v1/leads/${l._id}`).set(auth(token)).send({ note: 'x' }).expect(403);
    await t.http().post(`/api/v1/leads/${l._id}/cancel`).set(auth(token)).send({}).expect(403);
  });
});
