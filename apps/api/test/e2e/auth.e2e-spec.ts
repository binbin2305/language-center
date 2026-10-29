import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { Role, UserStatus } from '@lc/shared';
import { UsersService } from '../../src/modules/users/users.service';
import { generateTempPassword } from '../../src/modules/auth/password';
import { loginAs, signTestToken } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeStudent, makeUser } from '../factories';
import { DEFAULT_PASSWORD } from '../factories/user.factory';
import { models } from '../factories/common';

const MIN = 60_000;
const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';

function cookieOf(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers['set-cookie'] as string[] | undefined;
  return raw?.find((c) => c.startsWith('lc_rt='));
}
function cookieValue(res: { headers: Record<string, unknown> }): string {
  return (cookieOf(res) ?? '').split(';')[0];
}

describe('auth', () => {
  let t: TestApp;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (username: string, password: string = DEFAULT_PASSWORD) => t.http().post(LOGIN).send({ username, password });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('FR-AUTH-01 đăng nhập', () => {
    it('đúng mật khẩu → 200 {data:{accessToken,user}} + cookie lc_rt httpOnly', async () => {
      const u = await makeUser(t.conn, { role: Role.MANAGER });
      const res = await login(u.username);
      expect(res.status).toBe(200);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(res.body.data.user).toMatchObject({ id: u._id.toHexString(), username: u.username, role: 'MANAGER', mustChangePassword: false });
      const cookie = cookieOf(res) ?? '';
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie).toMatch(/Max-Age=604800/);
      expect(cookie).not.toMatch(/Secure/i);
    });
    it('sai mật khẩu và sai username → cùng 401 INVALID_CREDENTIALS, cùng body', async () => {
      const u = await makeUser(t.conn);
      const a = await login(u.username, 'WrongPass1');
      const b = await login('nobody@example.com', 'WrongPass1');
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(a.body).toEqual(b.body);
    });
    it('FR-USR-01 user LOCKED đăng nhập đúng mật khẩu → 423 ACCOUNT_LOCKED', async () => {
      const u = await makeUser(t.conn, { status: UserStatus.LOCKED });
      const res = await login(u.username);
      expect(res.status).toBe(423);
      expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    });
    it('user LOCKED sai mật khẩu → 401 INVALID_CREDENTIALS', async () => {
      const u = await makeUser(t.conn, { status: UserStatus.LOCKED });
      const res = await login(u.username, 'Wrong1234');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
    it('user DISABLED → 401', async () => {
      const u = await makeUser(t.conn, { status: UserStatus.DISABLED });
      for (const pw of [undefined, 'Wrong1234']) {
        const res = await login(u.username, pw);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      }
    });
    it('5 lần sai → lần thứ 5 trả 423 ACCOUNT_LOCKED; đúng mật khẩu khi đang khóa vẫn 423; sau 15 phút đăng nhập được', async () => {
      const u = await makeUser(t.conn);
      for (let i = 0; i < 4; i++) expect((await login(u.username, 'Wrong1234')).status).toBe(401);
      const fifth = await login(u.username, 'Wrong1234');
      expect(fifth.status).toBe(423);
      expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
      expect((await login(u.username)).status).toBe(423);
      t.clock.advance(15 * MIN + 1);
      const ok = await login(u.username);
      expect(ok.status).toBe(200);
      const fresh = await models(t.conn).User.findById(u._id);
      expect(fresh?.failedLoginCount).toBe(0);
      expect(fresh?.lockedUntil).toBeNull();
    });
    it('lần sai nằm ngoài cửa sổ 15 phút không cộng dồn', async () => {
      const u = await makeUser(t.conn);
      for (let i = 0; i < 4; i++) await login(u.username, 'Wrong1234');
      t.clock.advance(15 * MIN + 1);
      expect((await login(u.username, 'Wrong1234')).status).toBe(401);
      expect((await login(u.username)).status).toBe(200);
    });
    it('đăng nhập đúng reset bộ đếm', async () => {
      const u = await makeUser(t.conn);
      for (let i = 0; i < 3; i++) await login(u.username, 'Wrong1234');
      expect((await login(u.username)).status).toBe(200);
      for (let i = 0; i < 4; i++) expect((await login(u.username, 'Wrong1234')).status).toBe(401);
    });
    it('STUDENT đăng nhập bằng mã HV; JWT mang studentId', async () => {
      const s = await makeStudent(t.conn, { withUser: true });
      const res = await login(s.code);
      expect(res.status).toBe(200);
      expect(res.body.data.user).toMatchObject({ role: 'STUDENT', studentId: s._id.toHexString(), username: s.code });
    });
    it('STUDENT đăng nhập không phân biệt hoa thường: "hv2026…" và "Hv2026…"', async () => {
      const s = await makeStudent(t.conn, { withUser: true, code: 'HV202612345' });
      for (const typed of ['hv202612345', 'Hv202612345', ' HV202612345 ']) {
        const res = await login(typed);
        expect([typed, res.status]).toEqual([typed, 200]);
        expect(res.body.data.user.username).toBe(s.code);
      }
    });
    it('username lưu chuẩn hoá: STUDENT viết hoa, email viết thường; đăng nhập email không phân biệt hoa thường', async () => {
      const st = await models(t.conn).User.create({
        username: 'hv209900001',
        passwordHash: 'x',
        fullName: 'S',
        role: Role.STUDENT,
      });
      expect(st.username).toBe('HV209900001');
      const staff = await makeUser(t.conn, { email: 'Mixed.Case@Example.com' });
      expect(staff.username).toBe('mixed.case@example.com');
      expect((await login('MIXED.case@example.COM')).status).toBe(200);
    });
    it('mọi response không chứa passwordHash', async () => {
      const u = await makeUser(t.conn);
      const l = await login(u.username);
      const me = await t.http().get('/api/v1/auth/me').set(bearer(l.body.data.accessToken));
      const bad = await login(u.username, 'nope');
      for (const r of [l, me, bad]) {
        expect(JSON.stringify(r.body)).not.toContain('passwordHash');
        expect(JSON.stringify(r.body)).not.toContain('$2');
      }
    });
    it('body không hợp lệ → 400 VALIDATION_FAILED', async () => {
      const res = await t.http().post(LOGIN).send({ username: '' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('FR-AUTH-01 refresh & logout', () => {
    it('refresh xoay vòng: token mới; dùng lại cookie cũ → 401 và cookie mới cũng bị thu hồi', async () => {
      const u = await makeUser(t.conn);
      const l = await login(u.username);
      const c1 = cookieValue(l);
      const r = await t.http().post(REFRESH).set('Cookie', c1);
      expect(r.status).toBe(200);
      expect(r.body.data.user.id).toBe(u._id.toHexString());
      const c2 = cookieValue(r);
      expect(c2).not.toBe(c1);
      t.clock.advance(15_000);
      const reuse = await t.http().post(REFRESH).set('Cookie', c1);
      expect(reuse.status).toBe(401);
      expect((await t.http().post(REFRESH).set('Cookie', c2)).status).toBe(401);
    });
    it('hai tab refresh gần đồng thời: dùng lại token cũ trong 10s → 401 nhưng token kế nhiệm vẫn hợp lệ', async () => {
      const u = await makeUser(t.conn);
      const c1 = cookieValue(await login(u.username));
      const r = await t.http().post(REFRESH).set('Cookie', c1);
      expect(r.status).toBe(200);
      const c2 = cookieValue(r);
      t.clock.advance(5_000);
      const reuse = await t.http().post(REFRESH).set('Cookie', c1);
      expect(reuse.status).toBe(401);
      expect(reuse.body.error.code).toBe('UNAUTHENTICATED');
      expect((await t.http().post(REFRESH).set('Cookie', c2)).status).toBe(200);
    });
    it('dùng lại token cũ sau 15s → thu hồi toàn bộ', async () => {
      const u = await makeUser(t.conn);
      const c1 = cookieValue(await login(u.username));
      const other = cookieValue(await login(u.username));
      const c2 = cookieValue(await t.http().post(REFRESH).set('Cookie', c1));
      t.clock.advance(15_000);
      expect((await t.http().post(REFRESH).set('Cookie', c1)).status).toBe(401);
      expect((await t.http().post(REFRESH).set('Cookie', c2)).status).toBe(401);
      expect((await t.http().post(REFRESH).set('Cookie', other)).status).toBe(401);
    });
    it('refresh không cookie / cookie rác → 401', async () => {
      expect((await t.http().post(REFRESH)).status).toBe(401);
      expect((await t.http().post(REFRESH).set('Cookie', 'lc_rt=garbage')).status).toBe(401);
    });
    it('refresh hết hạn (7 ngày) → 401', async () => {
      const u = await makeUser(t.conn);
      const c = cookieValue(await login(u.username));
      t.clock.advance(7 * 24 * 60 * MIN + 1);
      expect((await t.http().post(REFRESH).set('Cookie', c)).status).toBe(401);
    });
    it('chỉ lưu sha256 của refresh token', async () => {
      const u = await makeUser(t.conn);
      const raw = cookieValue(await login(u.username)).slice('lc_rt='.length);
      const hash = createHash('sha256').update(raw).digest('hex');
      const docs = await t.conn.collection('refresh_tokens').find({ userId: u._id }).toArray();
      expect(docs).toHaveLength(1);
      expect(docs[0].tokenHash).toBe(hash);
      expect(JSON.stringify(docs[0])).not.toContain(raw);
    });
    it('refresh bị từ chối khi tài khoản bị khóa/vô hiệu sau khi đăng nhập', async () => {
      const u = await makeUser(t.conn);
      const c = cookieValue(await login(u.username));
      await models(t.conn).User.updateOne({ _id: u._id }, { status: UserStatus.DISABLED });
      expect((await t.http().post(REFRESH).set('Cookie', c)).status).toBe(401);
    });
    it('logout → refresh 401, xoá cookie; cần access token', async () => {
      const u = await makeUser(t.conn);
      const l = await login(u.username);
      const c = cookieValue(l);
      expect((await t.http().post('/api/v1/auth/logout')).status).toBe(401);
      const out = await t.http().post('/api/v1/auth/logout').set(bearer(l.body.data.accessToken)).set('Cookie', c);
      expect(out.status).toBe(204);
      expect(cookieOf(out)).toMatch(/lc_rt=;/);
      expect((await t.http().post(REFRESH).set('Cookie', c)).status).toBe(401);
    });
  });

  describe('FR-AUTH-02 me & đổi mật khẩu', () => {
    it('GET /auth/me trả user, kể cả teacherProfile', async () => {
      const { token, user } = await loginAs(t, Role.TEACHER);
      const res = await t.http().get('/api/v1/auth/me').set(bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: user._id.toHexString(), role: 'TEACHER', teacherProfile: { languages: ['Tiếng Anh'] }, mustChangePassword: false });
    });
    it('/auth/me với token user đã bị xoá → 401', async () => {
      const { token, user } = await loginAs(t, Role.MANAGER);
      await models(t.conn).User.deleteOne({ _id: user._id });
      expect((await t.http().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401);
    });
    it('mustChangePassword: token mcp vào route khác 403, /auth/me 200; đổi mật khẩu → cờ tắt, token mới không mcp, cookie xoay', async () => {
      const u = await makeUser(t.conn, { mustChangePassword: true });
      const l = await login(u.username);
      expect(l.body.data.user.mustChangePassword).toBe(true);
      const token = l.body.data.accessToken as string;
      const me = await t.http().get('/api/v1/auth/me').set(bearer(token));
      expect(me.status).toBe(200);
      expect(me.body.data.mustChangePassword).toBe(true);

      const weak = await t.http().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'abc' });
      expect(weak.status).toBe(400);
      const noDigit = await t.http().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'abcdefgh' });
      expect(noDigit.status).toBe(400);
      const wrong = await t.http().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: 'Wrong1234', newPassword: 'Newpass12' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

      const oldCookie = cookieValue(l);
      const ok = await t.http().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'Newpass12' });
      expect(ok.status).toBe(200);
      expect(ok.body.data.user.mustChangePassword).toBe(false);
      expect(JSON.stringify(ok.body)).not.toContain('passwordHash');
      const newToken = ok.body.data.accessToken as string;
      const payload = JSON.parse(Buffer.from(newToken.split('.')[1], 'base64url').toString()) as Record<string, unknown>;
      expect(payload.mcp).toBeUndefined();
      expect((await t.http().get('/api/v1/auth/me').set(bearer(newToken))).body.data.mustChangePassword).toBe(false);
      // refresh cookie rotated: old one revoked, new one works
      expect((await t.http().post(REFRESH).set('Cookie', oldCookie)).status).toBe(401);
      const fresh = await t.http().post(LOGIN).send({ username: u.username, password: 'Newpass12' });
      expect(fresh.status).toBe(200);
      expect((await login(u.username)).status).toBe(401);
    });
    it('change-password trả cookie mới dùng được để refresh', async () => {
      const u = await makeUser(t.conn);
      const l = await login(u.username);
      const ok = await t.http().post('/api/v1/auth/change-password').set(bearer(l.body.data.accessToken)).send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'Newpass12' });
      expect(ok.status).toBe(200);
      expect((await t.http().post(REFRESH).set('Cookie', cookieValue(ok))).status).toBe(200);
    });
  });

  describe('UsersService', () => {
    it('createStudentAccount → username=code, không email, mustChangePassword, mật khẩu tạm đăng nhập được', async () => {
      const users = t.app.get(UsersService);
      const student = await makeStudent(t.conn);
      const { userId, tempPassword } = await users.createStudentAccount(student._id, student.code);
      expect(tempPassword).toHaveLength(10);
      expect(tempPassword).toMatch(/[A-Za-z]/);
      expect(tempPassword).toMatch(/\d/);
      const u = await models(t.conn).User.findById(userId);
      expect(u).toMatchObject({ username: student.code, role: 'STUDENT', mustChangePassword: true });
      expect(u?.email).toBeUndefined();
      expect(u?.studentId?.toHexString()).toBe(student._id.toHexString());
      const res = await login(student.code, tempPassword);
      expect(res.status).toBe(200);
      expect(res.body.data.user.mustChangePassword).toBe(true);
    });
    it('createStaff tạo user email/username, tempPassword, audit; từ chối role STUDENT', async () => {
      const users = t.app.get(UsersService);
      const admin = await makeUser(t.conn, { role: Role.ADMIN });
      const actor = { id: admin._id, role: Role.ADMIN };
      const { user, tempPassword } = await users.createStaff({ email: 'New.Teacher@Example.com', fullName: 'Cô Lan', role: Role.TEACHER }, actor);
      expect(user.username).toBe('new.teacher@example.com');
      expect(user.mustChangePassword).toBe(true);
      expect((await login('new.teacher@example.com', tempPassword)).status).toBe(200);
      expect(await t.conn.collection('audit_logs').countDocuments({ entityId: user._id })).toBe(1);
      await expect(users.createStaff({ email: 'x@example.com', fullName: 'Xx', role: Role.STUDENT }, actor)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      await expect(users.createStaff({ email: 'new.teacher@example.com', fullName: 'Dup', role: Role.TEACHER }, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    });
    it('generateTempPassword: 10 ký tự có chữ và số, không trùng', () => {
      const set = new Set(Array.from({ length: 50 }, () => generateTempPassword()));
      expect(set.size).toBe(50);
      for (const p of set) {
        expect(p).toHaveLength(10);
        expect(p).toMatch(/[A-Za-z]/);
        expect(p).toMatch(/\d/);
      }
    });
  });

  it('subject của token không phải user tồn tại → /auth/me 401', async () => {
    const tok = signTestToken(t, { sub: new Types.ObjectId().toHexString(), role: 'MANAGER' });
    expect((await t.http().get('/api/v1/auth/me').set(bearer(tok))).status).toBe(401);
  });
});

describe('NFR-01 throttle login', () => {
  it('11 request /auth/login trong 1 phút từ cùng IP → 429 RATE_LIMITED', async () => {
    const prev = process.env.LOGIN_RATE_LIMIT;
    process.env.LOGIN_RATE_LIMIT = '10';
    const t = await createTestApp();
    try {
      let last = 0;
      let code: string | undefined;
      for (let i = 0; i < 11; i++) {
        const res = await t.http().post(LOGIN).send({ username: 'nobody@example.com', password: 'Wrong1234' });
        last = res.status;
        code = res.body.error?.code;
        if (i < 10) expect(res.status).toBe(401);
      }
      expect(last).toBe(429);
      expect(code).toBe('RATE_LIMITED');
    } finally {
      process.env.LOGIN_RATE_LIMIT = prev;
      if (prev === undefined) delete process.env.LOGIN_RATE_LIMIT;
      await t.close();
    }
  });
});

describe('seed admin', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('tạo ADMIN từ env, idempotent, đăng nhập được, bỏ qua khi env rỗng', async () => {
    const { seedAdmin } = await import('../../scripts/seed');
    expect(await seedAdmin(t.conn, { email: '', password: '' })).toBe('skipped');
    expect(await seedAdmin(t.conn, { email: undefined, password: 'Secret123' })).toBe('skipped');
    expect(await seedAdmin(t.conn, { email: 'Admin@Example.com', password: 'Secret123' })).toBe('created');
    expect(await seedAdmin(t.conn, { email: 'admin@example.com', password: 'Other1234' })).toBe('exists');
    expect(await models(t.conn).User.countDocuments({ role: 'ADMIN' })).toBe(1);
    const res = await t.http().post(LOGIN).send({ username: 'admin@example.com', password: 'Secret123' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('ADMIN');
  });
});

describe('lockout concurrency', () => {
  it('5 lần sai song song vẫn khóa tài khoản', async () => {
    const t = await createTestApp();
    try {
      const u = await makeUser(t.conn);
      const rs = await Promise.all(
        Array.from({ length: 5 }, () => t.http().post(LOGIN).send({ username: u.username, password: 'Wrong1234' })),
      );
      expect(rs.some((r) => r.status === 423)).toBe(true);
      expect((await t.http().post(LOGIN).send({ username: u.username, password: DEFAULT_PASSWORD })).status).toBe(423);
    } finally {
      await t.close();
    }
  });
});

describe('lockout bypass via parallel requests', () => {
  const run = async (wrong: number) => {
    const t = await createTestApp();
    try {
      const u = await makeUser(t.conn);
      const post = (password: string) => t.http().post(LOGIN).send({ username: u.username, password });
      const rs = await Promise.all([
        ...Array.from({ length: wrong }, () => post('Wrong1234')),
        post(DEFAULT_PASSWORD),
      ]);
      const fresh = await models(t.conn).User.findById(u._id);
      const locked = !!fresh?.lockedUntil && fresh.lockedUntil.getTime() > t.clock.now().getTime();
      // If any attempt observed a lock, the correct password must not have wiped it.
      if (rs.some((r) => r.status === 423)) {
        expect(locked).toBe(true);
        expect((await post(DEFAULT_PASSWORD)).status).toBe(423);
      }
      return rs;
    } finally {
      await t.close();
    }
  };
  it('5 sai + 1 đúng song song: tài khoản vẫn khoá, không mất khoá do reset', async () => {
    for (let i = 0; i < 8; i++) await run(5);
  });
  it('4 sai + 1 đúng song song: nếu khoá được đặt thì lần đúng không được xoá khoá', async () => {
    for (let i = 0; i < 8; i++) await run(4);
  });
  it('khoá đã đặt trước: đăng nhập đúng song song với khoá không bao giờ trả 200', async () => {
    const t = await createTestApp();
    try {
      const u = await makeUser(t.conn, { failedLoginCount: 5, failedLoginWindowStart: t.clock.now(), lockedUntil: new Date(t.clock.now().getTime() + 15 * MIN) });
      const rs = await Promise.all(Array.from({ length: 5 }, () => t.http().post(LOGIN).send({ username: u.username, password: DEFAULT_PASSWORD })));
      expect(rs.every((r) => r.status === 423)).toBe(true);
    } finally {
      await t.close();
    }
  });
});
