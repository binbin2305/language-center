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

/**
 * Two tabs refreshing at once present the same token; the loser must not log every session out.
 * A token rotated less than this long ago is rejected (401) without revoking the user's other tokens.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export type RotateResult =
  | { ok: true; userId: Types.ObjectId; raw: string }
  | { ok: false; reason: 'invalid' | 'reuse' | 'race' | 'expired' };

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly clock: ClockService,
    @InjectModel(Models.RefreshToken) private readonly tokens: Model<RefreshToken>,
  ) {}

  readonly refreshTtlMs = parseDurationMs(loadEnv().JWT_REFRESH_TTL);

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
   * every active token of that user is revoked — except within REFRESH_REUSE_GRACE_MS of a rotation
   * (concurrent refresh from another tab), which is rejected without revoking anything.
   * Not transactional: the claim is atomic, but a crash between claim and issuing the successor
   * leaves the user without a valid refresh token (they simply log in again).
   */
  async rotate(raw: string): Promise<RotateResult> {
    const now = this.clock.now();
    const existing = await this.tokens.findOne({ tokenHash: sha256(raw) });
    if (!existing) return { ok: false, reason: 'invalid' };
    if (existing.revokedAt) {
      if (existing.replacedBy && this.withinGrace(existing.revokedAt, now)) return { ok: false, reason: 'race' };
      await this.revokeAllForUser(existing.userId);
      return { ok: false, reason: 'reuse' };
    }
    if (existing.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
    // Atomic claim so concurrent refreshes with the same token cannot both succeed.
    const claimed = await this.tokens.findOneAndUpdate({ _id: existing._id, revokedAt: null }, { revokedAt: now });
    // Lost the claim to a concurrent rotation of the same token (another tab, same instant).
    if (!claimed) return { ok: false, reason: 'race' };
    const next = await this.issueRefresh(existing.userId);
    await this.tokens.updateOne({ _id: existing._id }, { replacedBy: next.id });
    return { ok: true, userId: existing.userId, raw: next.raw };
  }

  private withinGrace(revokedAt: Date, now: Date): boolean {
    return now.getTime() - revokedAt.getTime() < REFRESH_REUSE_GRACE_MS;
  }

  async revokeAllForUser(userId: Types.ObjectId): Promise<void> {
    await this.tokens.updateMany({ userId, revokedAt: null }, { revokedAt: this.clock.now() });
  }

  async revoke(raw: string, userId: Types.ObjectId): Promise<void> {
    await this.tokens.updateOne({ tokenHash: sha256(raw), userId, revokedAt: null }, { revokedAt: this.clock.now() });
  }
}
