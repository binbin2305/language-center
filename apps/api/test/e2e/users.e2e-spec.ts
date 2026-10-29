import { Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { DEFAULT_PASSWORD, makeUser } from '../factories';

describe('FR-USR-01 Tài khoản', () => {
  let t: TestApp;
  const tokens = {} as Record<Role, string>;
  const ids = {} as Record<Role, string>;
  const auth = (r: Role) => ({ Authorization: `Bearer ${tokens[r]}` });
  const post = (r: Role, b: unknown) => t.http().post('/api/v1/users').set(auth(r)).send(b as object);
  const login = (username: string, password: string) => t.http().post('/api/v1/auth/login').send({ username, password });
  let n = 0;
  const staff = (over: Record<string, unknown> = {}) => ({
    email: `nv${++n}@lc.vn`,
    fullName: `Nhân viên ${n}`,
    role: 'ACADEMIC_STAFF',
    ...over,
  });

  beforeAll(async () => {
    t = await createTestApp();
    for (const r of [Role.MANAGER, Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT, Role.ADMIN]) {
      const l = await loginAs(t, r);
      tokens[r] = l.token;
      ids[r] = l.user._id.toString();
    }
  });
  afterAll(async () => {
    await t.close();
  });

  it('M tạo TEACHER có teacherProfile → 201 { user, tempPassword }, mustChangePassword, không có passwordHash; A tạo được', async () => {
    const res = await post(
      Role.MANAGER,
      staff({ role: 'TEACHER', teacherProfile: { languages: ['en'], levels: ['B1'] } }),
    ).expect(201);
    expect(res.body.data.tempPassword).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ role: 'TEACHER', mustChangePassword: true, teacherProfile: { languages: ['en'], levels: ['B1'] } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    await post(Role.ADMIN, staff({ role: 'MANAGER' })).expect(201);
  });

  it('S, T, H POST /users → 403 (và các route khác)', async () => {
    const u = await makeUser(t.conn, { role: Role.TEACHER });
    for (const role of [Role.ACADEMIC_STAFF, Role.TEACHER, Role.STUDENT]) {
      await post(role, staff()).expect(403);
      await t.http().get('/api/v1/users').set(auth(role)).expect(403);
      await t.http().get(`/api/v1/users/${u._id}`).set(auth(role)).expect(403);
      await t.http().patch(`/api/v1/users/${u._id}`).set(auth(role)).send({ fullName: 'Xx Yy' }).expect(403);
      for (const a of ['lock', 'unlock', 'reset-password']) {
        await t.http().post(`/api/v1/users/${u._id}/${a}`).set(auth(role)).expect(403);
      }
    }
  });

  it('role ADMIN → 400 fields.role; role STUDENT → 400; email trùng khác hoa thường → 409 fields.email', async () => {
    const a = await post(Role.MANAGER, staff({ role: 'ADMIN' })).expect(400);
    expect(a.body.error.code).toBe('VALIDATION_FAILED');
    expect(a.body.error.details.fields.role).toBeDefined();
    await post(Role.ADMIN, staff({ role: 'ADMIN' })).expect(400);
    await post(Role.MANAGER, staff({ role: 'STUDENT' })).expect(400);
    await post(Role.MANAGER, staff({ email: 'dup@lc.vn' })).expect(201);
    const d = await post(Role.MANAGER, staff({ email: 'DUP@lc.vn' })).expect(409);
    expect(d.body.error.details.fields.email).toBeDefined();
  });

  it('lock → LOCKED, đăng nhập đúng mật khẩu → 423; unlock → đăng nhập được', async () => {
    const u = await makeUser(t.conn, { role: Role.TEACHER });
    const l = await t.http().post(`/api/v1/users/${u._id}/lock`).set(auth(Role.MANAGER)).expect(201);
    expect(l.body.data.status).toBe('LOCKED');
    expect((await login(u.username, DEFAULT_PASSWORD)).status).toBe(423);
    const ul = await t.http().post(`/api/v1/users/${u._id}/unlock`).set(auth(Role.MANAGER)).expect(201);
    expect(ul.body.data.status).toBe('ACTIVE');
    expect((await login(u.username, DEFAULT_PASSWORD)).status).toBe(200);
  });

  it('unlock xóa lockedUntil, failedLoginCount', async () => {
    const u = await makeUser(t.conn, { role: Role.TEACHER, status: 'LOCKED' as never, failedLoginCount: 5, lockedUntil: new Date('2030-01-01') });
    await t.http().post(`/api/v1/users/${u._id}/unlock`).set(auth(Role.ADMIN)).expect(201);
    const raw = await t.conn.collection('users').findOne({ _id: u._id });
    expect(raw).toMatchObject({ status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null });
  });

  it("lock chính mình → 400 VALIDATION_FAILED fields.id 'SELF'", async () => {
    const res = await t.http().post(`/api/v1/users/${ids[Role.MANAGER]}/lock`).set(auth(Role.MANAGER)).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.fields.id).toBe('SELF');
  });

  it('MANAGER lock/unlock/reset/PATCH user ADMIN → 403 FORBIDDEN; ADMIN làm được', async () => {
    const adm = await makeUser(t.conn, { role: Role.ADMIN });
    const m = auth(Role.MANAGER);
    for (const a of ['lock', 'unlock', 'reset-password']) {
      const r = await t.http().post(`/api/v1/users/${adm._id}/${a}`).set(m).expect(403);
      expect(r.body.error.code).toBe('FORBIDDEN');
    }
    await t.http().patch(`/api/v1/users/${adm._id}`).set(m).send({ fullName: 'Hack Er' }).expect(403);
    await t.http().post(`/api/v1/users/${adm._id}/lock`).set(auth(Role.ADMIN)).expect(201);
  });

  it('reset-password → { tempPassword }, mật khẩu cũ hết hiệu lực, mustChangePassword true', async () => {
    const u = await makeUser(t.conn, { role: Role.ACADEMIC_STAFF });
    const res = await t.http().post(`/api/v1/users/${u._id}/reset-password`).set(auth(Role.MANAGER)).expect(201);
    const temp = res.body.data.tempPassword as string;
    expect(temp).toEqual(expect.any(String));
    expect((await login(u.username, DEFAULT_PASSWORD)).status).toBe(401);
    const ok = await login(u.username, temp);
    expect(ok.status).toBe(200);
    const raw = await t.conn.collection('users').findOne({ _id: u._id });
    expect(raw?.mustChangePassword).toBe(true);
  });

  it('PATCH fullName/phone/teacherProfile → 200; role/email → 400; user không tồn tại → 404', async () => {
    const u = await makeUser(t.conn, { role: Role.TEACHER });
    const res = await t
      .http()
      .patch(`/api/v1/users/${u._id}`)
      .set(auth(Role.MANAGER))
      .send({ fullName: 'Tên Mới', phone: '0912345678', teacherProfile: { languages: ['fr'], levels: ['A1'] } })
      .expect(200);
    expect(res.body.data).toMatchObject({ fullName: 'Tên Mới', teacherProfile: { languages: ['fr'] } });
    await t.http().patch(`/api/v1/users/${u._id}`).set(auth(Role.MANAGER)).send({ role: 'ADMIN' }).expect(400);
    await t.http().patch(`/api/v1/users/${u._id}`).set(auth(Role.MANAGER)).send({ email: 'x@y.vn' }).expect(400);
    await t.http().patch('/api/v1/users/64b000000000000000000000').set(auth(Role.MANAGER)).send({ fullName: 'Aa Bb' }).expect(404);
    await t.http().patch('/api/v1/users/bad').set(auth(Role.MANAGER)).send({ fullName: 'Aa Bb' }).expect(404);
  });

  it('GET /users?role=TEACHER&q=lan lọc + phân trang; q regex an toàn; sort sai → 400', async () => {
    const a = await makeUser(t.conn, { role: Role.TEACHER, fullName: 'Lan Zeta Teacher' });
    const b = await makeUser(t.conn, { role: Role.ACADEMIC_STAFF, fullName: 'Lan Zeta Staff' });
    const res = await t.http().get('/api/v1/users?role=TEACHER&q=lan zeta&limit=1').set(auth(Role.MANAGER)).expect(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 1, total: 1 });
    expect(res.body.data[0].id).toBe(a._id.toString());
    expect(res.body.data.map((x: { id: string }) => x.id)).not.toContain(b._id.toString());
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    await t.http().get('/api/v1/users?q=(%2B').set(auth(Role.ADMIN)).expect(200);
    await t.http().get('/api/v1/users?sort=passwordHash').set(auth(Role.ADMIN)).expect(400);
  });

  it('GET /users/:id user STUDENT → 200 (xem được)', async () => {
    const res = await t.http().get(`/api/v1/users/${ids[Role.STUDENT]}`).set(auth(Role.MANAGER)).expect(200);
    expect(res.body.data.role).toBe('STUDENT');
    await t.http().get('/api/v1/users/64b000000000000000000000').set(auth(Role.MANAGER)).expect(404);
  });

  it('GET /teachers M, S → chỉ TEACHER ACTIVE sắp theo fullName; T, H, A → 403', async () => {
    const act = await makeUser(t.conn, { role: Role.TEACHER, fullName: 'AAA Active' });
    const dd = await makeUser(t.conn, { role: Role.TEACHER, fullName: 'Đào AAA' });
    const dz = await makeUser(t.conn, { role: Role.TEACHER, fullName: 'Dung AAA' });
    const ez = await makeUser(t.conn, { role: Role.TEACHER, fullName: 'Em AAA' });
    const lk = await makeUser(t.conn, { role: Role.TEACHER, fullName: 'AAA Locked', status: 'LOCKED' as never });
    for (const role of [Role.MANAGER, Role.ACADEMIC_STAFF]) {
      const res = await t.http().get('/api/v1/teachers').set(auth(role)).expect(200);
      const list = res.body.data as { id: string; fullName: string }[];
      expect(list.map((x) => x.id)).toContain(act._id.toString());
      expect(list.map((x) => x.id)).not.toContain(lk._id.toString());
      const order = list.map((x) => x.id).filter((i) => [dd, dz, ez].some((u) => u._id.toString() === i));
      expect(order).toEqual([dz, dd, ez].map((u) => u._id.toString()));
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|email/);
    }
    for (const role of [Role.TEACHER, Role.STUDENT, Role.ADMIN]) {
      await t.http().get('/api/v1/teachers').set(auth(role)).expect(403);
    }
  });

  it('PATCH status dùng chung đường lock/unlock: ACTIVE xóa throttle, audit STATUS, tự đổi → 400, DISABLED đăng nhập 401', async () => {
    const u = await makeUser(t.conn, { role: Role.TEACHER, status: 'LOCKED' as never, failedLoginCount: 5, lockedUntil: new Date('2030-01-01') });
    const res = await t.http().patch(`/api/v1/users/${u._id}`).set(auth(Role.MANAGER)).send({ status: 'ACTIVE' }).expect(200);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(await t.conn.collection('users').findOne({ _id: u._id })).toMatchObject({ lockedUntil: null, failedLoginCount: 0 });
    const log = await t.conn.collection('audit_logs').findOne({ entityId: u._id });
    expect(log?.action).toBe('status');
    await t.http().patch(`/api/v1/users/${u._id}`).set(auth(Role.MANAGER)).send({ status: 'DISABLED' }).expect(200);
    expect((await login(u.username, DEFAULT_PASSWORD)).status).toBe(401);
    const self = await t.http().patch(`/api/v1/users/${ids[Role.MANAGER]}`).set(auth(Role.MANAGER)).send({ status: 'LOCKED' }).expect(400);
    expect(self.body.error.details.fields.id).toBe('SELF');
  });

  it('unlock chỉ từ LOCKED: ACTIVE/DISABLED → 422 INVALID_STATUS_TRANSITION', async () => {
    const a = await makeUser(t.conn, { role: Role.TEACHER });
    const d = await makeUser(t.conn, { role: Role.TEACHER, status: 'DISABLED' as never });
    for (const u of [a, d]) {
      const r = await t.http().post(`/api/v1/users/${u._id}/unlock`).set(auth(Role.MANAGER)).expect(422);
      expect(r.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    }
  });

  it('reset-password xóa lockedUntil: user bị throttle-lock đăng nhập được bằng mật khẩu tạm', async () => {
    const u = await makeUser(t.conn, { role: Role.TEACHER, failedLoginCount: 5, lockedUntil: new Date('2030-01-01') });
    const res = await t.http().post(`/api/v1/users/${u._id}/reset-password`).set(auth(Role.MANAGER)).expect(201);
    expect((await login(u.username, res.body.data.tempPassword)).status).toBe(200);
  });

  it('id không tồn tại: lock/unlock/reset → 404 (kể cả MANAGER)', async () => {
    for (const a of ['lock', 'unlock', 'reset-password']) {
      await t.http().post(`/api/v1/users/64b000000000000000000000/${a}`).set(auth(Role.MANAGER)).expect(404);
    }
  });

  describe('R12 thu hồi refresh token khi reset mật khẩu / khóa / vô hiệu', () => {
    const REFRESH = '/api/v1/auth/refresh';
    const refreshCookie = async (username: string) => {
      const res = await login(username, DEFAULT_PASSWORD);
      expect(res.status).toBe(200);
      const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('lc_rt='));
      if (!raw) throw new Error('no refresh cookie');
      return raw.split(';')[0];
    };
    const liveTokens = (userId: unknown) => t.conn.collection('refresh_tokens').countDocuments({ userId, revokedAt: null });

    it('reset-password → refresh cookie cũ 401, mọi refresh token bị thu hồi', async () => {
      const u = await makeUser(t.conn, { role: Role.TEACHER });
      const c = await refreshCookie(u.username);
      await t.http().post(`/api/v1/users/${u._id}/reset-password`).set(auth(Role.MANAGER)).expect(201);
      expect(await liveTokens(u._id)).toBe(0);
      expect((await t.http().post(REFRESH).set('Cookie', c)).status).toBe(401);
    });

    it('lock → thu hồi refresh token: sau unlock cookie cũ vẫn 401', async () => {
      const u = await makeUser(t.conn, { role: Role.TEACHER });
      const c = await refreshCookie(u.username);
      await t.http().post(`/api/v1/users/${u._id}/lock`).set(auth(Role.MANAGER)).expect(201);
      expect(await liveTokens(u._id)).toBe(0);
      await t.http().post(`/api/v1/users/${u._id}/unlock`).set(auth(Role.MANAGER)).expect(201);
      expect((await t.http().post(REFRESH).set('Cookie', c)).status).toBe(401);
    });

    it('PATCH status LOCKED/DISABLED thu hồi refresh token; PATCH fullName thì không', async () => {
      for (const status of ['LOCKED', 'DISABLED']) {
        const u = await makeUser(t.conn, { role: Role.TEACHER });
        const c = await refreshCookie(u.username);
        await t.http().patch(`/api/v1/users/${u._id}`).set(auth(Role.MANAGER)).send({ fullName: 'Tên Mới' }).expect(200);
        expect(await liveTokens(u._id)).toBe(1);
        await t.http().patch(`/api/v1/users/${u._id}`).set(auth(Role.MANAGER)).send({ status }).expect(200);
        expect(await liveTokens(u._id)).toBe(0);
        await t.http().patch(`/api/v1/users/${u._id}`).set(auth(Role.MANAGER)).send({ status: 'ACTIVE' }).expect(200);
        expect((await t.http().post(REFRESH).set('Cookie', c)).status).toBe(401);
      }
    });
  });

  it('audit: create/lock/unlock/reset ghi audit_logs entity User', async () => {
    const c = await post(Role.MANAGER, staff()).expect(201);
    const id = c.body.data.user.id as string;
    await t.http().post(`/api/v1/users/${id}/lock`).set(auth(Role.MANAGER)).expect(201);
    await t.http().post(`/api/v1/users/${id}/unlock`).set(auth(Role.MANAGER)).expect(201);
    await t.http().post(`/api/v1/users/${id}/reset-password`).set(auth(Role.MANAGER)).expect(201);
    const logs = await t.conn.collection('audit_logs').find({ entityId: { $exists: true }, entity: 'User' }).toArray();
    const mine = logs.filter((l) => String(l.entityId) === id);
    expect(mine.map((l) => l.action).sort()).toEqual(['create', 'status', 'status', 'update']);
    expect(JSON.stringify(mine)).not.toMatch(/passwordHash/);
  });
});
