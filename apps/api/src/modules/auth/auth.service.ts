import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthResultDto, ChangePasswordInput, ErrorCode, LoginInput, MeDto, UserStatus } from '@lc/shared';
import { ClockService } from '../../common/clock/clock.service';
import { AppError } from '../../common/errors/app-error';
import { Models } from '../../database/models';
import { User, UserDoc } from '../../database/schemas/user.schema';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password';
import { TokenService } from './token.service';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;

export interface AuthSession {
  result: AuthResultDto;
  refreshToken: string;
}

/** Matches the stored canonical form: emails lowercase, student codes uppercase. */
export function normalizeLoginUsername(raw: string): string {
  const u = raw.trim();
  return u.includes('@') ? u.toLowerCase() : u.toUpperCase();
}

export function toMeDto(u: UserDoc): MeDto {
  return {
    id: u._id.toHexString(),
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    ...(u.email ? { email: u.email } : {}),
    ...(u.studentId ? { studentId: u.studentId.toHexString() } : {}),
    ...(u.teacherProfile
      ? {
          teacherProfile: {
            languages: [...u.teacherProfile.languages],
            levels: [...u.teacherProfile.levels],
            ...(u.teacherProfile.specialization ? { specialization: u.teacherProfile.specialization } : {}),
          },
        }
      : {}),
    mustChangePassword: u.mustChangePassword,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Models.User) private readonly users: Model<User>,
    private readonly tokens: TokenService,
    private readonly clock: ClockService,
  ) {}

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.users
      .findOne({ username: normalizeLoginUsername(input.username), deletedAt: null })
      .select('+passwordHash');
    if (!user) {
      await burnPasswordCheck(input.password);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS);
    }
    const now = this.clock.now();
    if (user.status === UserStatus.ACTIVE && user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
      throw new AppError(ErrorCode.ACCOUNT_LOCKED, undefined, { lockedUntil: user.lockedUntil.toISOString() });
    }
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (user.status !== UserStatus.ACTIVE) {
      // D4: an admin-locked account reveals itself only to someone holding the right password.
      if (user.status === UserStatus.LOCKED && valid) throw new AppError(ErrorCode.ACCOUNT_LOCKED);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS);
    }
    if (!valid) {
      const locked = await this.recordFailure(user._id, now);
      if (locked) throw new AppError(ErrorCode.ACCOUNT_LOCKED, undefined, { lockedUntil: locked.toISOString() });
      throw new AppError(ErrorCode.INVALID_CREDENTIALS);
    }
    // Atomic and conditional: a lock set by parallel failures after our snapshot must not be cleared,
    // and in that case no token is issued.
    const reset = await this.users.findOneAndUpdate(
      { _id: user._id, $or: [{ lockedUntil: null }, { lockedUntil: { $lte: now } }] },
      { failedLoginCount: 0, failedLoginWindowStart: null, lockedUntil: null },
      { timestamps: false },
    );
    if (!reset) throw new AppError(ErrorCode.ACCOUNT_LOCKED);
    return this.startSession(user);
  }

  /** Atomically records a failed attempt; returns lockedUntil when this attempt (or a concurrent one) locked the account. */
  private async recordFailure(id: Types.ObjectId, now: Date): Promise<Date | null> {
    const cutoff = new Date(now.getTime() - WINDOW_MS);
    const lockUntil = new Date(now.getTime() + LOCK_MS);
    const updated = await this.users.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            inWindow: {
              $and: [{ $ne: ['$failedLoginWindowStart', null] }, { $gt: ['$failedLoginWindowStart', cutoff] }],
            },
          },
        },
        {
          $set: {
            failedLoginCount: { $cond: ['$inWindow', { $add: [{ $ifNull: ['$failedLoginCount', 0] }, 1] }, 1] },
            failedLoginWindowStart: { $cond: ['$inWindow', '$failedLoginWindowStart', now] },
          },
        },
        {
          $set: {
            lockedUntil: { $cond: [{ $gte: ['$failedLoginCount', MAX_FAILURES] }, lockUntil, '$lockedUntil'] },
          },
        },
        { $unset: 'inWindow' },
      ],
      { new: true, timestamps: false },
    );
    return updated?.lockedUntil && updated.lockedUntil.getTime() > now.getTime() ? updated.lockedUntil : null;
  }

  async refresh(raw: string | undefined): Promise<AuthSession> {
    if (!raw) throw new AppError(ErrorCode.UNAUTHENTICATED);
    const rotated = await this.tokens.rotate(raw);
    if (!rotated.ok) throw new AppError(ErrorCode.UNAUTHENTICATED);
    const user = await this.users.findOne({ _id: rotated.userId, deletedAt: null });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.tokens.revokeAllForUser(rotated.userId);
      throw new AppError(ErrorCode.UNAUTHENTICATED);
    }
    return { result: { accessToken: this.tokens.signAccess(user), user: toMeDto(user) }, refreshToken: rotated.raw };
  }

  async logout(userId: Types.ObjectId, raw: string | undefined): Promise<void> {
    if (raw) await this.tokens.revoke(raw, userId);
  }

  async me(userId: Types.ObjectId): Promise<MeDto> {
    const user = await this.users.findOne({ _id: userId, deletedAt: null });
    if (!user || user.status !== UserStatus.ACTIVE) throw new AppError(ErrorCode.UNAUTHENTICATED);
    return toMeDto(user);
  }

  async changePassword(userId: Types.ObjectId, input: ChangePasswordInput): Promise<AuthSession> {
    const user = await this.users.findOne({ _id: userId, deletedAt: null }).select('+passwordHash');
    if (!user || user.status !== UserStatus.ACTIVE) throw new AppError(ErrorCode.UNAUTHENTICATED);
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      // 400 (not 401) so the web client does not mistake a typo for an expired session.
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 400);
    }
    user.passwordHash = await hashPassword(input.newPassword);
    user.mustChangePassword = false;
    await user.save();
    await this.tokens.revokeAllForUser(user._id);
    return this.startSession(user);
  }

  private async startSession(user: UserDoc): Promise<AuthSession> {
    const refresh = await this.tokens.issueRefresh(user._id);
    return { result: { accessToken: this.tokens.signAccess(user), user: toMeDto(user) }, refreshToken: refresh.raw };
  }
}
