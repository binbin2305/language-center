import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { Role } from '@lc/shared';
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
