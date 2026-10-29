import { Types } from 'mongoose';
import { Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeRoom } from '../factories';

describe('Phòng học', () => {
  let t: TestApp;
  const tokens = {} as Record<Role, string>;
  const auth = (r: Role) => ({ Authorization: `Bearer ${tokens[r]}` });
  const body = (over: Record<string, unknown> = {}) => ({ code: 'p-101', name: 'Phòng 101', capacity: 20, ...over });
  const post = (r: Role, b: unknown) => t.http().post('/api/v1/rooms').set(auth(r)).send(b as object);

  beforeAll(async () => {
    t = await createTestApp();
    for (const r of [Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT, Role.ADMIN]) tokens[r] = (await loginAs(t, r)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  it('M, S tạo phòng → 201, code UPPERCASE, không lộ _id', async () => {
    const res = await post(Role.MANAGER, body({ code: 'mgr-r1' })).expect(201);
    expect(res.body.data).toMatchObject({ code: 'MGR-R1', capacity: 20, status: 'ACTIVE' });
    expect(res.body.data._id).toBeUndefined();
    await post(Role.ACADEMIC_STAFF, body({ code: 'stf-r1' })).expect(201);
  });

  it('T, H, A mọi route → 403', async () => {
    const r = await makeRoom(t.conn);
    for (const role of [Role.TEACHER, Role.STUDENT, Role.ADMIN]) {
      await post(role, body({ code: 'x1' })).expect(403);
      await t.http().get('/api/v1/rooms').set(auth(role)).expect(403);
      await t.http().get(`/api/v1/rooms/${r._id}`).set(auth(role)).expect(403);
      await t.http().patch(`/api/v1/rooms/${r._id}`).set(auth(role)).send({ name: 'n' }).expect(403);
    }
  });

  it('code trùng khác hoa thường → 409 fields.code; song song → 1×201, 1×409', async () => {
    await post(Role.MANAGER, body({ code: 'DUP-1' })).expect(201);
    const res = await post(Role.MANAGER, body({ code: 'dup-1' })).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.fields.code).toBeDefined();
    const rs = await Promise.all([post(Role.MANAGER, body({ code: 'race-r' })), post(Role.ACADEMIC_STAFF, body({ code: 'RACE-R' }))]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('capacity 0 → 400 fields.capacity', async () => {
    const res = await post(Role.MANAGER, body({ code: 'v1', capacity: 0 })).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.capacity).toBeDefined();
  });

  it('PATCH { code } → 400; PATCH name/capacity/status → 200', async () => {
    const r = await makeRoom(t.conn);
    await t.http().patch(`/api/v1/rooms/${r._id}`).set(auth(Role.MANAGER)).send({ code: 'NEW' }).expect(400);
    const res = await t
      .http()
      .patch(`/api/v1/rooms/${r._id}`)
      .set(auth(Role.ACADEMIC_STAFF))
      .send({ name: 'Mới', capacity: 35, status: 'INACTIVE' })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'Mới', capacity: 35, status: 'INACTIVE' });
  });

  it('GET /rooms?status=ACTIVE lọc; q regex an toàn; sort sai → 400', async () => {
    const a = await makeRoom(t.conn, { name: 'Omega Active' });
    const i = await makeRoom(t.conn, { name: 'Omega Inactive', status: 'INACTIVE' as never });
    const list = await t.http().get('/api/v1/rooms?status=ACTIVE&q=Omega&limit=100').set(auth(Role.MANAGER)).expect(200);
    const ids = list.body.data.map((x: { id: string }) => x.id);
    expect(ids).toContain(a._id.toString());
    expect(ids).not.toContain(i._id.toString());
    await t.http().get('/api/v1/rooms?q=(%2B').set(auth(Role.MANAGER)).expect(200);
    await t.http().get('/api/v1/rooms?sort=code').set(auth(Role.MANAGER)).expect(200);
    await t.http().get('/api/v1/rooms?sort=password').set(auth(Role.MANAGER)).expect(400);
  });

  it('GET /rooms/:id → 200; không tồn tại / id sai → 404', async () => {
    const r = await makeRoom(t.conn);
    const ok = await t.http().get(`/api/v1/rooms/${r._id}`).set(auth(Role.ACADEMIC_STAFF)).expect(200);
    expect(ok.body.data.id).toBe(r._id.toString());
    await t.http().get(`/api/v1/rooms/${new Types.ObjectId()}`).set(auth(Role.MANAGER)).expect(404);
    await t.http().get('/api/v1/rooms/not-an-id').set(auth(Role.MANAGER)).expect(404);
    await t.http().patch(`/api/v1/rooms/${new Types.ObjectId()}`).set(auth(Role.MANAGER)).send({ name: 'n' }).expect(404);
  });
});
