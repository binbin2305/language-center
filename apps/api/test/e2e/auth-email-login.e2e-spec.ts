import { Role } from '@lc/shared';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeStudent, makeUser } from '../factories';
import { DEFAULT_PASSWORD } from '../factories/user.factory';
import { models } from '../factories/common';

const LOGIN = '/api/v1/auth/login';

describe('FR-ADM-04 đăng nhập HV bằng email (D23)', () => {
  let t: TestApp;
  const login = (username: string, password: string = DEFAULT_PASSWORD) => t.http().post(LOGIN).send({ username, password });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('HV có email a@x.vn đăng nhập "A@X.VN" + đúng mật khẩu → 200, user là HV đó', async () => {
    const s = await makeStudent(t.conn, { email: 'a@x.vn', withUser: true });
    const res = await login('A@X.VN');
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: s.userId!.toHexString(), role: 'STUDENT', username: s.code });
  });

  it('sai mật khẩu → 401 INVALID_CREDENTIALS, tăng failedLoginCount của user đó', async () => {
    const s = await makeStudent(t.conn, { email: 'b@x.vn', withUser: true });
    const res = await login('b@x.vn', 'Wrong1234');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const u = await models(t.conn).User.findById(s.userId);
    expect(u!.failedLoginCount).toBe(1);
  });

  it('5 lần sai bằng email → khóa 423 như đăng nhập bằng mã', async () => {
    await makeStudent(t.conn, { email: 'lock@x.vn', withUser: true });
    let last = await login('lock@x.vn', 'Wrong1234');
    for (let i = 0; i < 4; i++) last = await login('lock@x.vn', 'Wrong1234');
    expect(last.status).toBe(423);
    expect(last.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('hai HV cùng email → 401 INVALID_CREDENTIALS cho cả hai mật khẩu, không tăng failedLoginCount', async () => {
    const a = await makeStudent(t.conn, { email: 'parent@x.vn', withUser: true });
    const b = await makeStudent(t.conn, { email: 'parent@x.vn', withUser: true });
    for (const pw of [DEFAULT_PASSWORD, 'Wrong1234']) {
      const res = await login('parent@x.vn', pw);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    for (const s of [a, b]) {
      const u = await models(t.conn).User.findById(s.userId);
      expect(u!.failedLoginCount ?? 0).toBe(0);
    }
  });

  it('HV xóa mềm → 401', async () => {
    await makeStudent(t.conn, { email: 'gone@x.vn', withUser: true, deletedAt: new Date() });
    const res = await login('gone@x.vn');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('staff đăng nhập bằng email username như cũ', async () => {
    const u = await makeUser(t.conn, { role: Role.MANAGER });
    const res = await login(u.username);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(u._id.toHexString());
  });

  it('mã HV vẫn đăng nhập được', async () => {
    const s = await makeStudent(t.conn, { email: 'c@x.vn', withUser: true });
    const res = await login(s.code.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(s.userId!.toHexString());
  });

  it('thông điệp lỗi không phân biệt các trường hợp (sai mật khẩu / email lạ / trùng email)', async () => {
    await makeStudent(t.conn, { email: 'd@x.vn', withUser: true });
    await makeStudent(t.conn, { email: 'dup@x.vn', withUser: true });
    await makeStudent(t.conn, { email: 'dup@x.vn', withUser: true });
    const bodies = [await login('d@x.vn', 'Wrong1234'), await login('nobody@x.vn'), await login('dup@x.vn')].map((r) => [r.status, r.body]);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
  });
});
