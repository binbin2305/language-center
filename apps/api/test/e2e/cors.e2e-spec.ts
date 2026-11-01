import { createTestApp, TestApp } from '../helpers/test-app';

const WEB = 'http://web.test:4173';
const EVIL = 'http://evil.test';

describe('NFR-01 CORS chỉ phản chiếu WEB_ORIGIN (CR L-HARDENING-1)', () => {
  let t: TestApp;
  const prev = process.env.WEB_ORIGIN;
  beforeAll(async () => {
    process.env.WEB_ORIGIN = WEB;
    t = await createTestApp();
  });
  afterAll(async () => {
    if (prev === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = prev;
    await t.close();
  });

  it('Origin = WEB_ORIGIN → Access-Control-Allow-Origin = WEB_ORIGIN + credentials', async () => {
    const res = await t.http().get('/api/v1/health').set('Origin', WEB);
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('Origin lạ → không có Access-Control-Allow-Origin', async () => {
    const res = await t.http().get('/api/v1/health').set('Origin', EVIL);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight OPTIONS từ origin lạ → không có Access-Control-Allow-Origin', async () => {
    const res = await t
      .http()
      .options('/api/v1/students')
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight OPTIONS từ WEB_ORIGIN → cho phép', async () => {
    const res = await t
      .http()
      .options('/api/v1/students')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe(WEB);
  });
});
