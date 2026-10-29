import { Types } from 'mongoose';
import { Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeCourse } from '../factories';

describe('FR-FEE-01 Khóa học', () => {
  let t: TestApp;
  const tokens = {} as Record<Role, string>;
  const auth = (r: Role) => ({ Authorization: `Bearer ${tokens[r]}` });
  const body = (over: Record<string, unknown> = {}) => ({
    code: 'ielts-a',
    name: 'IELTS A',
    language: 'Tiếng Anh',
    levels: ['A1'],
    totalSessions: 24,
    baseFee: 3_000_000,
    ...over,
  });
  const post = (r: Role, b: unknown) => t.http().post('/api/v1/courses').set(auth(r)).send(b as object);

  beforeAll(async () => {
    t = await createTestApp();
    for (const r of [Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT]) tokens[r] = (await loginAs(t, r)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  it('M tạo khóa → 201, code lưu UPPERCASE, baseFee 3_000_000', async () => {
    const res = await post(Role.MANAGER, body({ code: 'mgr-1' })).expect(201);
    expect(res.body.data).toMatchObject({ code: 'MGR-1', baseFee: 3_000_000, status: 'ACTIVE' });
    expect(typeof res.body.data.id).toBe('string');
    expect(res.body.data._id).toBeUndefined();
  });

  it('S tạo được', async () => {
    await post(Role.ACADEMIC_STAFF, body({ code: 'staff-1' })).expect(201);
  });

  it('T, H POST → 403; T, H GET /courses → 200', async () => {
    await post(Role.TEACHER, body({ code: 'x1' })).expect(403);
    await post(Role.STUDENT, body({ code: 'x2' })).expect(403);
    await t.http().get('/api/v1/courses').set(auth(Role.TEACHER)).expect(200);
    await t.http().get('/api/v1/courses').set(auth(Role.STUDENT)).expect(200);
  });

  it('T, H PATCH → 403', async () => {
    const c = await makeCourse(t.conn);
    await t.http().patch(`/api/v1/courses/${c._id}`).set(auth(Role.TEACHER)).send({ name: 'n' }).expect(403);
    await t.http().patch(`/api/v1/courses/${c._id}`).set(auth(Role.STUDENT)).send({ name: 'n' }).expect(403);
  });

  it('code "ielts-a" khi đã có "IELTS-A" → 409 CONFLICT details.fields.code', async () => {
    await post(Role.MANAGER, body({ code: 'IELTS-A' })).expect(201);
    const res = await post(Role.MANAGER, body({ code: 'ielts-a' })).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.fields.code).toBeDefined();
  });

  it('hai POST song song cùng code → 1×201, 1×409', async () => {
    const rs = await Promise.all([
      post(Role.MANAGER, body({ code: 'race-1' })),
      post(Role.ACADEMIC_STAFF, body({ code: 'RACE-1' })),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409)!.body.error.details.fields.code).toBeDefined();
  });

  it('levels: [] → 400 VALIDATION_FAILED fields.levels', async () => {
    const res = await post(Role.MANAGER, body({ code: 'v1', levels: [] })).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.levels).toBeDefined();
  });

  it('baseFee 1.5 → 400 fields.baseFee', async () => {
    const res = await post(Role.MANAGER, body({ code: 'v2', baseFee: 1.5 })).expect(400);
    expect(res.body.error.details.fields.baseFee).toBeDefined();
  });

  it('PATCH { code } → 400', async () => {
    const c = await makeCourse(t.conn);
    await t.http().patch(`/api/v1/courses/${c._id}`).set(auth(Role.MANAGER)).send({ code: 'NEW' }).expect(400);
  });

  it('GET /courses?status=ACTIVE không chứa khóa ARCHIVED; PATCH status ARCHIVED → 200', async () => {
    const c = await makeCourse(t.conn, { name: 'Zeta Archive Me' });
    const keep = await makeCourse(t.conn, { name: 'Zeta Keep' });
    const res = await t
      .http()
      .patch(`/api/v1/courses/${c._id}`)
      .set(auth(Role.ACADEMIC_STAFF))
      .send({ status: 'ARCHIVED' })
      .expect(200);
    expect(res.body.data.status).toBe('ARCHIVED');
    const list = await t.http().get('/api/v1/courses?status=ACTIVE&q=Zeta&limit=100').set(auth(Role.STUDENT)).expect(200);
    const ids = list.body.data.map((x: { id: string }) => x.id);
    expect(ids).toContain(keep._id.toString());
    expect(ids).not.toContain(c._id.toString());
  });

  it('GET list: q có ký tự regex không lỗi, sort allow-list, sort sai → 400', async () => {
    await t.http().get('/api/v1/courses?q=(%2B').set(auth(Role.MANAGER)).expect(200);
    const l = await t.http().get('/api/v1/courses?sort=code').set(auth(Role.MANAGER)).expect(200);
    expect(l.body.meta.total).toBeGreaterThan(0);
    await t.http().get('/api/v1/courses?sort=baseFee').set(auth(Role.MANAGER)).expect(400);
  });

  it('GET /courses/:id → 200; không tồn tại / id sai → 404', async () => {
    const c = await makeCourse(t.conn);
    const ok = await t.http().get(`/api/v1/courses/${c._id}`).set(auth(Role.STUDENT)).expect(200);
    expect(ok.body.data.id).toBe(c._id.toString());
    await t.http().get(`/api/v1/courses/${new Types.ObjectId()}`).set(auth(Role.MANAGER)).expect(404);
    await t.http().get('/api/v1/courses/not-an-id').set(auth(Role.MANAGER)).expect(404);
    await t.http().patch(`/api/v1/courses/${new Types.ObjectId()}`).set(auth(Role.MANAGER)).send({ name: 'n' }).expect(404);
  });
});
