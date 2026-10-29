import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import {
  AuditAction,
  CreateUserInput,
  CreateUserResultDto,
  ErrorCode,
  ListUsersQuery,
  Paginated,
  ResetPasswordResultDto,
  Role,
  TeacherOptionDto,
  UpdateUserInput,
  UserDto,
  UserStatus,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { RefreshTokenRevoker } from '../../common/auth/refresh-token-revoker';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { Models } from '../../database/models';
import { Student } from '../../database/schemas/student.schema';
import { User, UserDoc } from '../../database/schemas/user.schema';
import { generateTempPassword, hashPassword } from '../auth/password';
import { escapeRegex } from '../courses/courses.service';
import { toTeacherOptionDto, toUserDto, UserLean } from './users.mapper';

/** Side effects of entering a status; ACTIVE clears login-throttle state. */
const STATUS_RESET: Record<string, Record<string, unknown>> = {
  ACTIVE: { lockedUntil: null, failedLoginCount: 0, failedLoginWindowStart: null },
  LOCKED: {},
  DISABLED: {},
};

const SORTS = new Set(['fullName', 'email', 'role', 'status', 'createdAt']);

function isDuplicateKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 11000;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly audit: AuditService,
    private readonly revoker: RefreshTokenRevoker,
    @InjectConnection() private readonly conn: Connection,
  ) {}

  /** Creates the STUDENT login (username = student code, no email). The caller links `student.userId`. */
  async createStudentAccount(
    studentId: Types.ObjectId,
    code: string,
    s?: ClientSession,
  ): Promise<{ userId: Types.ObjectId; tempPassword: string }> {
    const student = await this.students.findById(studentId).session(s ?? null).select('fullName');
    if (!student) throw new AppError(ErrorCode.NOT_FOUND);
    const tempPassword = generateTempPassword();
    const [user] = await this.users.create(
      [
        {
          username: code,
          passwordHash: await hashPassword(tempPassword),
          fullName: student.fullName,
          role: Role.STUDENT,
          studentId,
          mustChangePassword: true,
        },
      ],
      { session: s },
    );
    return { userId: user._id, tempPassword };
  }

  /** Creates a non-student account (email is the username) with a temporary password. */
  async createStaff(input: CreateUserInput, actor: AuthUser): Promise<{ user: UserDoc; tempPassword: string }> {
    if (input.role === Role.STUDENT || input.role === Role.ADMIN) throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { role: input.role } });
    const email = input.email.trim().toLowerCase();
    const tempPassword = generateTempPassword();
    let user: UserDoc;
    try {
      user = await this.users.create({
        email,
        username: email,
        passwordHash: await hashPassword(tempPassword),
        fullName: input.fullName,
        ...(input.phone ? { phone: input.phone } : {}),
        role: input.role,
        mustChangePassword: true,
        ...(input.role === Role.TEACHER && input.teacherProfile ? { teacherProfile: input.teacherProfile } : {}),
      });
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.CONFLICT, undefined, { fields: { email: 'DUPLICATE' } });
      throw e;
    }
    await this.audit.log({
      actor,
      action: AuditAction.CREATE,
      entity: Models.User,
      entityId: user._id,
      after: { username: user.username, email: user.email, fullName: user.fullName, role: user.role },
    });
    return { user, tempPassword };
  }

  async createAccount(input: CreateUserInput, actor: AuthUser): Promise<CreateUserResultDto> {
    const { user, tempPassword } = await this.createStaff(input, actor);
    return { user: toUserDto(user.toObject() as unknown as UserLean), tempPassword };
  }

  async list(q: ListUsersQuery): Promise<Paginated<UserDto>> {
    if (q.sort && !SORTS.has(q.sort.replace(/^[-+]/, ''))) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { sort: 'INVALID' } });
    }
    const filter: FilterQuery<User> = { deletedAt: null };
    if (q.role) filter.role = q.role;
    if (q.status) filter.status = q.status;
    if (q.q) {
      const re = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ fullName: re }, { email: re }, { username: re }];
    }
    const page = await paginate(this.users, filter, { page: q.page, limit: q.limit, sort: q.sort }, { passwordHash: 0 });
    return { data: (page.data as unknown as UserLean[]).map(toUserDto), meta: page.meta };
  }

  async get(id: string): Promise<UserDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const u = await this.users.findOne({ _id: id, deletedAt: null }).lean();
    if (!u) throw new AppError(ErrorCode.NOT_FOUND);
    return toUserDto(u as unknown as UserLean);
  }

  async listTeacherOptions(): Promise<TeacherOptionDto[]> {
    const rows = await this.users
      .find({ role: Role.TEACHER, status: UserStatus.ACTIVE, deletedAt: null })
      .sort({ fullName: 1, _id: 1 })
      .collation({ locale: 'vi' })
      .lean();
    return (rows as unknown as UserLean[]).map(toTeacherOptionDto);
  }

  async update(id: string, input: UpdateUserInput, actor: AuthUser): Promise<UserDto> {
    const before = await this.loadManageable(id, actor);
    if (input.status && actor.id.equals(before._id)) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { id: 'SELF' } });
    }
    if (input.teacherProfile && before.role !== Role.TEACHER) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { teacherProfile: 'NOT_TEACHER' } });
    }
    const set: Record<string, unknown> = { ...input };
    if (input.status) Object.assign(set, STATUS_RESET[input.status]);
    const revoke = input.status === UserStatus.LOCKED || input.status === UserStatus.DISABLED;
    const after = await this.mutate(id, actor, { $set: set }, revoke);
    await this.audit.log({
      actor,
      action: input.status ? AuditAction.STATUS : AuditAction.UPDATE,
      entity: Models.User,
      entityId: before._id,
      before: this.snapshot(before),
      after: this.snapshot(after),
    });
    return toUserDto(after);
  }

  async lock(id: string, actor: AuthUser): Promise<UserDto> {
    if (actor.id.equals(id)) throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { id: 'SELF' } });
    const before = await this.loadManageable(id, actor);
    const after = await this.mutate(id, actor, { $set: { status: UserStatus.LOCKED, ...STATUS_RESET.LOCKED } }, true);
    await this.audit.log({
      actor,
      action: AuditAction.STATUS,
      entity: Models.User,
      entityId: before._id,
      before: { status: before.status },
      after: { status: after.status },
    });
    return toUserDto(after);
  }

  async unlock(id: string, actor: AuthUser): Promise<UserDto> {
    const before = await this.loadManageable(id, actor);
    if (before.status !== UserStatus.LOCKED) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
    const after = await this.mutate(id, actor, { $set: { status: UserStatus.ACTIVE, ...STATUS_RESET.ACTIVE } });
    await this.audit.log({
      actor,
      action: AuditAction.STATUS,
      entity: Models.User,
      entityId: before._id,
      before: { status: before.status },
      after: { status: after.status },
    });
    return toUserDto(after);
  }

  async resetPassword(id: string, actor: AuthUser): Promise<ResetPasswordResultDto> {
    const before = await this.loadManageable(id, actor);
    const tempPassword = generateTempPassword();
    await this.mutate(id, actor, {
      $set: { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, lockedUntil: null, failedLoginCount: 0, failedLoginWindowStart: null },
    }, true);
    await this.audit.log({
      actor,
      action: AuditAction.UPDATE,
      entity: Models.User,
      entityId: before._id,
      after: { passwordReset: true },
    });
    return { tempPassword };
  }

  private snapshot(u: UserLean) {
    return { fullName: u.fullName, phone: u.phone, status: u.status, teacherProfile: u.teacherProfile };
  }

  /** 404 if absent; 403 when a MANAGER targets an ADMIN. */
  private async loadManageable(id: string, actor: AuthUser): Promise<UserLean> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const u = (await this.users.findOne({ _id: id, deletedAt: null }).lean()) as unknown as UserLean | null;
    if (!u) throw new AppError(ErrorCode.NOT_FOUND);
    if (actor.role === Role.MANAGER && u.role === Role.ADMIN) throw new AppError(ErrorCode.FORBIDDEN);
    return u;
  }

  /**
   * Conditional update (role guard re-checked atomically for MANAGER actors).
   * `revokeSessions`: also revoke the user's refresh tokens in the same transaction (R12), so a
   * reset password or a lock cannot be outlived by a refresh cookie issued before it.
   */
  private async mutate(
    id: string,
    actor: AuthUser,
    update: Record<string, unknown>,
    revokeSessions = false,
  ): Promise<UserLean> {
    const filter: FilterQuery<User> = { _id: id, deletedAt: null };
    if (actor.role === Role.MANAGER) filter.role = { $ne: Role.ADMIN };
    const u = await withTransaction(this.conn, async (s) => {
      const doc = (await this.users
        .findOneAndUpdate(filter, update, { new: true, runValidators: true, session: s })
        .lean()) as unknown as UserLean | null;
      if (doc && revokeSessions) await this.revoker.revokeAllForUser(doc._id, s);
      return doc;
    });
    if (u) return u;
    // Nothing matched: gone (404) vs. MANAGER targeting an ADMIN (403).
    const exists = await this.users.exists({ _id: id, deletedAt: null });
    throw new AppError(exists ? ErrorCode.FORBIDDEN : ErrorCode.NOT_FOUND);
  }
}
