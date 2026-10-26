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

  it('trust proxy mặc định false', () => {
    expect(t.app.getHttpAdapter().getInstance().get('trust proxy')).toBe(false);
  });
});

describe('TRUST_PROXY', () => {
  it('TRUST_PROXY=1 → express trust proxy = 1 (req.ip lấy từ X-Forwarded-For qua 1 proxy)', async () => {
    process.env.TRUST_PROXY = '1';
    const t = await createTestApp();
    try {
      expect(t.app.getHttpAdapter().getInstance().get('trust proxy')).toBe(1);
    } finally {
      delete process.env.TRUST_PROXY;
      await t.close();
    }
  });
});
