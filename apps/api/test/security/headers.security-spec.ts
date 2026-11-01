import { ErrorCode } from '@lc/shared';
import { loadEnv } from '../../src/config/env';
import { makeUser } from '../factories/user.factory';
import { createTestApp, TestApp } from '../helpers/test-app';

/**
 * H-01A headers + login rate limit (NFR-01, Review Focus 4). This file's app boots with the
 * production default LOGIN_RATE_LIMIT (10): setup-env.ts raises it for the other suites, so it is
 * unset before createTestApp and restored afterwards.
 */
describe('NFR-01 FR-AUTH-01 Header bảo mật, CORS và giới hạn đăng nhập', () => {
  let t: TestApp;
  const savedLimit = process.env.LOGIN_RATE_LIMIT;
  const webOrigin = loadEnv().WEB_ORIGIN;

  beforeAll(async () => {
    delete process.env.LOGIN_RATE_LIMIT;
    expect(loadEnv().LOGIN_RATE_LIMIT).toBe(10);
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
    if (savedLimit === undefined) delete process.env.LOGIN_RATE_LIMIT;
    else process.env.LOGIN_RATE_LIMIT = savedLimit;
  });

  it('helmet: x-content-type-options nosniff, x-frame-options và content-security-policy có mặt, x-powered-by vắng', async () => {
    const res = await t.http().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeTruthy();
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: Origin = WEB_ORIGIN → access-control-allow-origin = WEB_ORIGIN, kèm access-control-allow-credentials: true', async () => {
    const res = await t.http().get('/api/v1/health').set('Origin', webOrigin);
    expect(res.headers['access-control-allow-origin']).toBe(webOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('CORS: Origin http://evil.test → access-control-allow-origin không phải evil (trình duyệt chặn)', async () => {
    const res = await t.http().get('/api/v1/health').set('Origin', 'http://evil.test');
    expect(res.headers['access-control-allow-origin']).not.toBe('http://evil.test');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  // CR L-HARDENING-1 (fixed in lane/L-LEAD 0060773): only WEB_ORIGIN is reflected.
  it('CR L-HARDENING-1 CORS: Origin http://evil.test → không có header access-control-allow-origin', async () => {
    const res = await t.http().get('/api/v1/health').set('Origin', 'http://evil.test');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CR L-HARDENING-1 CORS preflight: OPTIONS từ http://evil.test → không có header access-control-allow-origin', async () => {
    const res = await t
      .http()
      .options('/api/v1/auth/login')
      .set('Origin', 'http://evil.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  // Each attempt uses a different account so the per-account lockout (423 after 5 failures) does
  // not mask the per-IP throttle; only the IP is shared.
  it('POST /auth/login sai mật khẩu 10 lần cùng IP → 401; lần 11 → 429 RATE_LIMITED (LOGIN_RATE_LIMIT mặc định 10)', async () => {
    const users = await Promise.all(Array.from({ length: 11 }, () => makeUser(t.conn)));
    const statuses: number[] = [];
    let last: { status: number; body: { error?: { code?: string } } } | undefined;
    for (let i = 0; i < 11; i++) {
      last = await t.http().post('/api/v1/auth/login').send({ username: users[i].username, password: 'WrongPass9' });
      statuses.push(last.status);
    }
    expect(statuses).toEqual([...Array<number>(10).fill(401), 429]);
    expect(last?.body.error?.code).toBe(ErrorCode.RATE_LIMITED);
  });
});
