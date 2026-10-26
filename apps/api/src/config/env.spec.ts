import { loadEnv } from './env';

const base = {
  MONGODB_URI: 'mongodb://localhost/x',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('loadEnv', () => {
  it('áp dụng giá trị mặc định', () => {
    const env = loadEnv(base);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.JWT_REFRESH_TTL).toBe('7d');
    expect(env.WEB_ORIGIN).toBe('http://localhost:5173');
    expect(env.UPLOAD_DIR).toBe('./uploads');
    expect(env.PORT).toBe(3000);
    expect(env.BCRYPT_COST).toBe(12);
  });
  it('throw khi thiếu JWT_ACCESS_SECRET', () => {
    const rest: Record<string, string | undefined> = { ...base, JWT_ACCESS_SECRET: undefined };
    expect(() => loadEnv(rest)).toThrow(/JWT_ACCESS_SECRET/);
  });
  it('throw khi JWT secret ngắn hơn 32 ký tự', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'a'.repeat(31) })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({ ...base, JWT_REFRESH_SECRET: 'b'.repeat(31) })).toThrow(/JWT_REFRESH_SECRET/);
  });
  it('ép kiểu PORT và BCRYPT_COST', () => {
    const env = loadEnv({ ...base, PORT: '4000', BCRYPT_COST: '10' });
    expect(env.PORT).toBe(4000);
    expect(env.BCRYPT_COST).toBe(10);
  });
  it('JWT_REFRESH_SECRET là tuỳ chọn (dự phòng, không dùng)', () => {
    const rest: Record<string, string | undefined> = { ...base, JWT_REFRESH_SECRET: undefined };
    expect(loadEnv(rest).JWT_REFRESH_SECRET).toBeUndefined();
  });
  it('TRUST_PROXY: mặc định false; nhận true/false, số hop, hoặc danh sách', () => {
    expect(loadEnv(base).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...base, TRUST_PROXY: '' }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(loadEnv({ ...base, TRUST_PROXY: 'loopback, 10.0.0.0/8' }).TRUST_PROXY).toBe('loopback, 10.0.0.0/8');
  });
});
