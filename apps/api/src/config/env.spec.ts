import { loadEnv } from './env';

const base = {
  MONGODB_URI: 'mongodb://localhost/x',
  JWT_ACCESS_SECRET: 'a'.repeat(16),
  JWT_REFRESH_SECRET: 'b'.repeat(16),
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
  it('ép kiểu PORT và BCRYPT_COST', () => {
    const env = loadEnv({ ...base, PORT: '4000', BCRYPT_COST: '10' });
    expect(env.PORT).toBe(4000);
    expect(env.BCRYPT_COST).toBe(10);
  });
});
