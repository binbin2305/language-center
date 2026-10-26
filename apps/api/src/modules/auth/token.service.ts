import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { ClockService } from '../../common/clock/clock.service';
import { loadEnv } from '../../config/env';
import { Models } from '../../database/models';
import { RefreshToken } from '../../database/schemas/refresh-token.schema';
import { User } from '../../database/schemas/user.schema';

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDurationMs(v: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(v.trim());
  if (!m) throw new Error(`Invalid duration: ${v}`);
  return Number(m[1]) * UNIT_MS[m[2]];
}

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export type RotateResult =
  | { ok: true; userId: Types.ObjectId; raw: string }
  | { ok: false; reason: 'invalid' | 'reuse' | 'expired' };

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly clock: ClockService,
    @InjectModel(Models.RefreshToken) private readonly tokens: Model<RefreshToken>,
  ) {}

  get refreshTtlMs(): number {
    return parseDurationMs(loadEnv().JWT_REFRESH_TTL);
  }

  signAccess(user: { _id: Types.ObjectId; role: User['role']; studentId?: Types.ObjectId; mustChangePassword: boolean }): string {
    return this.jwt.sign({
      sub: user._id.toHexString(),
      role: user.role,
      ...(user.studentId ? { studentId: user.studentId.toHexString() } : {}),
      ...(user.mustChangePassword ? { mcp: true } : {}),
      iat: Math.floor(this.clock.now().getTime() / 1000),
    });
  }

  /** Issues an opaque refresh token; only its sha256 is stored. */
  async issueRefresh(userId: Types.ObjectId): Promise<{ raw: string; id: Types.ObjectId }> {
    const raw = randomBytes(48).toString('base64url');
    const doc = await this.tokens.create({
      userId,
      tokenHash: sha256(raw),
      expiresAt: new Date(this.clock.now().getTime() + this.refreshTtlMs),
    });
    return { raw, id: doc._id };
  }

  /**
   * Single-use rotation. Presenting an already-revoked token is treated as theft:
   * every active token of that user is revoked.
   */
  async rotate(raw: string): Promise<RotateResult> {
    const now = this.clock.now();
    const existing = await this.tokens.findOne({ tokenHash: sha256(raw) });
    if (!existing) return { ok: false, reason: 'invalid' };
    if (existing.revokedAt) {
      await this.revokeAllForUser(existing.userId);
      return { ok: false, reason: 'reuse' };
    }
    if (existing.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
    // Atomic claim so concurrent refreshes with the same token cannot both succeed.
    const claimed = await this.tokens.findOneAndUpdate({ _id: existing._id, revokedAt: null }, { revokedAt: now });
    if (!claimed) {
      await this.revokeAllForUser(existing.userId);
      return { ok: false, reason: 'reuse' };
    }
    const next = await this.issueRefresh(existing.userId);
    await this.tokens.updateOne({ _id: existing._id }, { replacedBy: next.id });
    return { ok: true, userId: existing.userId, raw: next.raw };
  }

  async revokeAllForUser(userId: Types.ObjectId): Promise<void> {
    await this.tokens.updateMany({ userId, revokedAt: null }, { revokedAt: this.clock.now() });
  }

  async revoke(raw: string, userId: Types.ObjectId): Promise<void> {
    await this.tokens.updateOne({ tokenHash: sha256(raw), userId, revokedAt: null }, { revokedAt: this.clock.now() });
  }
}
