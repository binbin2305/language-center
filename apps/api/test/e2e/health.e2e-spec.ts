import { createTestApp, TestApp } from '../helpers/test-app';

describe('health', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('GET /api/v1/health → 200 {status:"ok", db:"up"}', async () => {
    const res = await t.http().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', db: 'up' } });
  });
});
