import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { Role } from '@lc/shared';
import type { User, UserDoc } from '../../src/database/schemas/user.schema';
import { DEFAULT_PASSWORD, makeUser } from '../factories/user.factory';
import { TestApp } from './test-app';

export interface TestTokenPayload {
  sub?: string;
  /** Deliberately loose so negative tests can sign invalid claims. */
  role: Role | string;
  studentId?: string;
  mcp?: unknown;
}

/** Signs an access token with iat taken from the app's FakeClock. */
export function signTestToken(t: TestApp, payload: TestTokenPayload, opts: { expiresIn?: string } = {}): string {
  const jwt = t.app.get(JwtService);
  const iat = Math.floor(t.clock.now().getTime() / 1000);
  return jwt.sign(
    { ...payload, sub: payload.sub ?? new Types.ObjectId().toHexString(), iat },
    { expiresIn: (opts.expiresIn ?? '15m') as JwtSignOptions['expiresIn'] },
  );
}

/** Creates a user through the factory and logs in through the real /auth/login endpoint. */
export async function loginAs(
  t: TestApp,
  role: Role,
  overrides: Partial<Omit<User, 'role'>> = {},
): Promise<{ token: string; user: UserDoc }> {
  const user = await makeUser(t.conn, { ...overrides, role });
  const res = await t.http().post('/api/v1/auth/login').send({ username: user.username, password: DEFAULT_PASSWORD });
  if (res.status !== 200) throw new Error(`loginAs(${role}) failed with ${res.status}: ${JSON.stringify(res.body)}`);
  return { token: res.body.data.accessToken as string, user };
}
