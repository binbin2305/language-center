import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  AuditAction,
  ClassStatus,
  type BulkCreateSessionsInput,
  type BulkCreateSessionsResultDto,
  type CheckConflictsInput,
  type CheckConflictsResultDto,
  type CreateSessionInput,
  type CancelFutureSessionsResultDto,
  type CreateSessionResultDto,
  type UpdateSessionInput,
  SessionStatus,
  ErrorCode,
  Role,
  RoomStatus,
  type SessionConflictDto,
  type SessionDto,
  type SessionWarning,
  toDateOnly,
  UserStatus,
  vnDay,
  addVnDays,
  startOfVnDay,
  type ListSessionsQuery,
} from '@lc/shared';
import { ScopeService } from '../../common/scope/scope.service';
import { ClockService } from '../../common/clock/clock.service';
import { AuditService } from '../../common/audit/audit.service';
import { CounterService } from '../../common/db/counter.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { SCHEDULE_CONFLICT_CHECKER, type ScheduleConflictChecker } from '../../common/contracts/schedule-conflict-checker';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { Models } from '../../database/models';
import type { Attendance } from '../../database/schemas/attendance.schema';
import type { Class, ClassDoc } from '../../database/schemas/class.schema';
import type { Room, RoomDoc } from '../../database/schemas/room.schema';
import type { Session, SessionDoc } from '../../database/schemas/session.schema';
import type { User } from '../../database/schemas/user.schema';
import { findSlotConflicts } from './conflict-checker';
import { expandWeekly } from './recurrence';
import { toSessionDto, toSessionViewDto } from './schedule.mapper';
import { ScheduleNotifier } from './schedule-notifier';

const MAX_RANGE_DAYS = 92;
/** Sessions can only be scheduled for classes that are still running or about to start. */
const OPEN_CLASS_STATUSES: ClassStatus[] = [ClassStatus.PLANNED, ClassStatus.ONGOING];

interface Range {
  startAt: Date;
  endAt: Date;
}

interface Resolved {
  cls: ClassDoc;
  room: RoomDoc;
  warnings: SessionWarning[];
}

const fieldError = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { [field]: message } });

@Injectable()
export class ScheduleService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Session) private readonly sessions: Model<Session>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Room) private readonly rooms: Model<Room>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectModel(Models.Attendance) private readonly attendances: Model<Attendance>,
    @Inject(SCHEDULE_CONFLICT_CHECKER) private readonly checker: ScheduleConflictChecker,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
    private readonly clock: ClockService,
    private readonly scope: ScopeService,
    private readonly notifier: ScheduleNotifier,
  ) {}

  async checkConflicts(input: CheckConflictsInput): Promise<CheckConflictsResultDto> {
    const range = { startAt: new Date(input.startAt), endAt: new Date(input.endAt) };
    if (range.endAt <= range.startAt) throw fieldError('endAt', 'MUST_BE_AFTER_START');
    const conflicts = await this.checker.findConflicts({
      roomId: new Types.ObjectId(input.roomId),
      teacherId: new Types.ObjectId(input.teacherId),
      ...range,
      ...(input.excludeSessionId ? { excludeSessionId: new Types.ObjectId(input.excludeSessionId) } : {}),
    });
    return { conflicts };
  }

  async create(input: CreateSessionInput, actor: AuthUser): Promise<CreateSessionResultDto> {
    const range = { startAt: new Date(input.startAt), endAt: new Date(input.endAt) };
    if (range.endAt <= range.startAt) throw fieldError('endAt', 'MUST_BE_AFTER_START');

    const result = await withTransaction(this.conn, async (s) => {
      const { cls, warnings } = await this.resolve(input, s);
      this.assertInClassRange(cls, [range]);
      await this.lockSchedule({ classId: input.classId, roomId: input.roomId, teacherId: input.teacherId }, s);
      await this.assertNoConflicts(input.roomId, input.teacherId, [range], cls, s);
      const [doc] = await this.sessions.create(
        [{ classId: cls._id, roomId: input.roomId, teacherId: input.teacherId, ...range, createdBy: actor.id }],
        { session: s },
      );
      await this.audit.log({ actor, action: AuditAction.CREATE, entity: Models.Session, entityId: doc._id, after: doc.toObject() }, s);
      return { session: toSessionDto(doc), warnings };
    });
    await this.notifier.sessionCreated({ id: result.session.id, classId: input.classId, startAt: range.startAt, extraRecipients: [input.teacherId] });
    return result;
  }

  /** Dry-run of createBulk: same validation and expansion, no writes and no schedule locks. */
  async checkBulkConflicts(input: BulkCreateSessionsInput): Promise<CheckConflictsResultDto> {
    if (input.endTime <= input.startTime) throw fieldError('endTime', 'MUST_BE_AFTER_START');
    if (input.fromDate > input.toDate) throw fieldError('toDate', 'MUST_BE_ON_OR_AFTER_FROM');
    const { cls } = await this.resolve(input);
    this.assertDaysInClassRange(cls, [input.fromDate, input.toDate]);
    const ranges = expandWeekly(input);
    if (ranges.length === 0) throw fieldError('weekdays', 'NO_MATCHING_DAYS');
    this.assertInClassRange(cls, ranges);
    return { conflicts: await this.collectConflicts(input.roomId, input.teacherId, ranges, cls) };
  }

  async createBulk(input: BulkCreateSessionsInput, actor: AuthUser): Promise<BulkCreateSessionsResultDto> {
    if (input.endTime <= input.startTime) throw fieldError('endTime', 'MUST_BE_AFTER_START');
    if (input.fromDate > input.toDate) throw fieldError('toDate', 'MUST_BE_ON_OR_AFTER_FROM');

    const result = await withTransaction(this.conn, async (s) => {
      const { cls, warnings } = await this.resolve(input, s);
      // Bound the expansion by the class window before generating anything.
      this.assertDaysInClassRange(cls, [input.fromDate, input.toDate]);
      const ranges = expandWeekly(input);
      if (ranges.length === 0) throw fieldError('weekdays', 'NO_MATCHING_DAYS');
      this.assertInClassRange(cls, ranges);
      await this.lockSchedule({ classId: input.classId, roomId: input.roomId, teacherId: input.teacherId }, s);
      await this.assertNoConflicts(input.roomId, input.teacherId, ranges, cls, s);

      const seriesId = new Types.ObjectId();
      const docs = await this.sessions.insertMany(
        ranges.map((r) => ({ classId: cls._id, roomId: input.roomId, teacherId: input.teacherId, ...r, seriesId, createdBy: actor.id })),
        { session: s },
      );
      for (const doc of docs) {
        await this.audit.log({ actor, action: AuditAction.CREATE, entity: Models.Session, entityId: doc._id, after: doc.toObject() }, s);
      }
      return {
        seriesId: seriesId.toString(),
        sessions: docs.map((d) => toSessionDto(d)),
        warnings,
      };
    });
    const sorted = result.sessions.map((x) => new Date(x.startAt)).sort((a, b) => a.getTime() - b.getTime());
    await this.notifier.seriesCreated(input.classId, sorted.length, sorted[0], sorted[sorted.length - 1], [input.teacherId]);
    return result;
  }

  async update(id: string, input: UpdateSessionInput, actor: AuthUser): Promise<CreateSessionResultDto> {
    const { result, changed, previousTeacherId } = await withTransaction(this.conn, async (s) => {
      const current = await this.findOrThrow(id, s);
      if (current.status === SessionStatus.CANCELLED) throw new AppError(ErrorCode.SESSION_LOCKED);
      const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      const now = this.clock.now();
      // Lock check precedes resolve() so a locked session is 422 even when the payload is otherwise invalid.
      if (Object.keys(changes).length > 0 && (current.attendanceTakenAt || current.startAt <= now)) {
        throw new AppError(ErrorCode.SESSION_LOCKED);
      }
      const merged = {
        classId: current.classId.toString(),
        roomId: input.roomId ?? current.roomId.toString(),
        teacherId: input.teacherId ?? current.teacherId.toString(),
        startAt: input.startAt ? new Date(input.startAt) : current.startAt,
        endAt: input.endAt ? new Date(input.endAt) : current.endAt,
      };
      if (merged.endAt <= merged.startAt) throw fieldError('endAt', 'MUST_BE_AFTER_START');
      const { cls, warnings } = await this.resolve(merged, s);
      if (Object.keys(changes).length === 0) return { result: { session: toSessionDto(current), warnings }, changed: false, previousTeacherId: null };

      const range = { startAt: merged.startAt, endAt: merged.endAt };
      this.assertInClassRange(cls, [range]);
      await this.lockSchedule(merged, s);
      await this.assertNoConflicts(merged.roomId, merged.teacherId, [range], cls, s, current._id);

      const updated = await this.sessions.findOneAndUpdate(
        { _id: current._id, status: SessionStatus.SCHEDULED, attendanceTakenAt: null, startAt: { $gt: now } },
        { $set: { roomId: merged.roomId, teacherId: merged.teacherId, ...range } },
        { new: true, session: s },
      );
      if (!updated) throw new AppError(ErrorCode.SESSION_LOCKED);
      // R12: attendance carries a copy of startAt; keep it in step (normally none exist before the session starts).
      if (updated.startAt.getTime() !== current.startAt.getTime()) {
        await this.attendances.updateMany({ sessionId: updated._id }, { $set: { startAt: updated.startAt } }, { session: s, timestamps: false });
      }
      await this.audit.log(
        { actor, action: AuditAction.UPDATE, entity: Models.Session, entityId: updated._id, before: current.toObject(), after: updated.toObject() },
        s,
      );
      return { result: { session: toSessionDto(updated), warnings }, changed: true, previousTeacherId: current.teacherId.toString() };
    });
    if (changed) {
      await this.notifier.sessionUpdated({
        id: result.session.id,
        classId: result.session.classId,
        startAt: new Date(result.session.startAt),
        extraRecipients: [result.session.teacherId, ...(previousTeacherId ? [previousTeacherId] : [])],
      });
    }
    return result;
  }

  async cancel(id: string, reason: string, actor: AuthUser): Promise<SessionDto> {
    const trimmed = this.requireReason(reason);
    const dto = await withTransaction(this.conn, async (s) => {
      const current = await this.findOrThrow(id, s);
      const updated = await this.cancelOne(current._id, trimmed, s);
      if (!updated) throw new AppError(ErrorCode.SESSION_NOT_CANCELLABLE);
      await this.auditCancel(current, updated, actor, s);
      return toSessionDto(updated);
    });
    await this.notifier.sessionCancelled({ id: dto.id, classId: dto.classId, startAt: new Date(dto.startAt), extraRecipients: [dto.teacherId] }, trimmed);
    return dto;
  }

  async cancelFuture(classId: string, reason: string, actor: AuthUser): Promise<CancelFutureSessionsResultDto> {
    const trimmed = this.requireReason(reason);
    if (!Types.ObjectId.isValid(classId)) throw new AppError(ErrorCode.NOT_FOUND);
    const result = await withTransaction(this.conn, async (s) => {
      if (!(await this.classes.exists({ _id: classId }).session(s))) throw new AppError(ErrorCode.NOT_FOUND);
      const future = await this.sessions
        .find({ classId, status: SessionStatus.SCHEDULED, startAt: { $gt: this.clock.now() } })
        .sort({ startAt: 1 })
        .session(s);
      let cancelled = 0;
      const teacherIds = new Set<string>();
      for (const before of future) {
        const updated = await this.cancelOne(before._id, trimmed, s);
        if (!updated) continue;
        await this.auditCancel(before, updated, actor, s);
        cancelled += 1;
        teacherIds.add(String(updated.teacherId));
      }
      return { cancelled, teacherIds: [...teacherIds] };
    });
    if (result.cancelled > 0) await this.notifier.futureCancelled(classId, result.cancelled, trimmed, result.teacherIds);
    return { cancelled: result.cancelled };
  }

  /** GET /sessions (FR-SCH-06): sessions in [from, to] VN days, limited to the caller's scope. */
  async list(query: ListSessionsQuery, user: AuthUser): Promise<SessionDto[]> {
    const fromAt = startOfVnDay(query.from);
    if (query.to < query.from) throw fieldError('to', 'MUST_BE_ON_OR_AFTER_FROM');
    if (query.to > addVnDays(query.from, MAX_RANGE_DAYS)) throw fieldError('to', 'RANGE_TOO_LONG');
    const toAt = startOfVnDay(addVnDays(query.to, 1));

    const and: object[] = [{ startAt: { $gte: fromAt, $lt: toAt } }, await this.scopeFilter(user)];
    if (query.classId) and.push({ classId: new Types.ObjectId(query.classId) });
    if (query.teacherId) and.push({ teacherId: new Types.ObjectId(query.teacherId) });
    if (query.roomId) and.push({ roomId: new Types.ObjectId(query.roomId) });
    const docs = await this.sessions.find({ $and: and }).sort({ startAt: 1, _id: 1 });
    return this.toViewDtos(docs);
  }

  /** GET /sessions/:id (FR-SCH-06): 404 when outside the caller's scope. */
  async getOne(id: string, user: AuthUser): Promise<SessionDto> {
    if (!Types.ObjectId.isValid(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const doc = await this.sessions.findOne({ $and: [{ _id: id }, await this.scopeFilter(user)] });
    if (!doc) throw new AppError(ErrorCode.NOT_FOUND);
    return (await this.toViewDtos([doc]))[0];
  }

  private async scopeFilter(user: AuthUser): Promise<object> {
    const now = this.clock.now();
    switch (user.role) {
      case Role.STUDENT: {
        if (!user.studentId) return { _id: { $in: [] } };
        const [current, history] = await Promise.all([
          this.scope.studentClassIds(user.studentId, 'current'),
          this.scope.studentClassIds(user.studentId, 'history'),
        ]);
        return {
          $or: [
            { classId: { $in: current }, startAt: { $gt: now } },
            { classId: { $in: history }, startAt: { $lte: now } },
          ],
        };
      }
      case Role.TEACHER:
        return { $or: [{ classId: { $in: await this.scope.teacherClassIds(user.id) } }, { teacherId: user.id }] };
      default:
        return {};
    }
  }

  private async toViewDtos(docs: SessionDoc[]): Promise<SessionDto[]> {
    const ids = (pick: (d: SessionDoc) => Types.ObjectId) => [...new Set(docs.map((d) => String(pick(d))))].map((x) => new Types.ObjectId(x));
    const [classes, rooms, teachers] = await Promise.all([
      this.classes.find({ _id: { $in: ids((d) => d.classId) } }, { code: 1 }).lean(),
      this.rooms.find({ _id: { $in: ids((d) => d.roomId) } }, { name: 1 }).lean(),
      this.users.find({ _id: { $in: ids((d) => d.teacherId) } }, { fullName: 1 }).lean(),
    ]);
    const classCode = new Map(classes.map((c) => [String(c._id), c.code]));
    const roomName = new Map(rooms.map((r) => [String(r._id), r.name]));
    const teacherName = new Map(teachers.map((u) => [String(u._id), u.fullName]));
    const now = this.clock.now();
    return docs.map((d) =>
      toSessionViewDto(d, now, {
        classCode: classCode.get(String(d.classId)),
        roomName: roomName.get(String(d.roomId)),
        teacherName: teacherName.get(String(d.teacherId)),
      }),
    );
  }

  private requireReason(reason: string): string {
    const trimmed = reason.trim();
    if (!trimmed) throw new AppError(ErrorCode.REASON_REQUIRED);
    return trimmed;
  }

  private async findOrThrow(id: string, s: ClientSession) {
    if (!Types.ObjectId.isValid(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const doc = await this.sessions.findById(id).session(s);
    if (!doc) throw new AppError(ErrorCode.NOT_FOUND);
    return doc;
  }

  private cancelOne(id: Types.ObjectId, reason: string, s: ClientSession) {
    return this.sessions.findOneAndUpdate(
      { _id: id, status: SessionStatus.SCHEDULED, startAt: { $gt: this.clock.now() } },
      { $set: { status: SessionStatus.CANCELLED, cancelReason: reason } },
      { new: true, session: s },
    );
  }

  private auditCancel(before: SessionDoc, after: SessionDoc, actor: AuthUser, s: ClientSession) {
    return this.audit.log(
      { actor, action: AuditAction.STATUS, entity: Models.Session, entityId: after._id, before: before.toObject(), after: after.toObject() },
      s,
    );
  }

  private async resolve(
    input: { classId: string; roomId: string; teacherId: string },
    s?: ClientSession,
  ): Promise<Resolved> {
    const loaders = [
      () => this.classes.findById(input.classId).session(s ?? null),
      () => this.rooms.findById(input.roomId).session(s ?? null),
      () => this.users.findById(input.teacherId).session(s ?? null),
    ] as const;
    // A ClientSession must not run concurrent operations, so reads inside a transaction go one by one.
    const [cls, room, teacher] = s
      ? [await loaders[0](), await loaders[1](), await loaders[2]()]
      : await Promise.all([loaders[0](), loaders[1](), loaders[2]()]);
    if (!cls) throw new AppError(ErrorCode.NOT_FOUND);
    if (!OPEN_CLASS_STATUSES.includes(cls.status)) throw new AppError(ErrorCode.CLASS_NOT_OPEN);
    if (!room || room.status !== RoomStatus.ACTIVE) throw fieldError('roomId', 'INVALID_ROOM');
    if (!teacher || teacher.deletedAt || teacher.role !== Role.TEACHER || teacher.status !== UserStatus.ACTIVE) {
      throw fieldError('teacherId', 'NOT_AN_ACTIVE_TEACHER');
    }
    const warnings: SessionWarning[] =
      room.capacity < cls.maxCapacity
        ? [{ code: 'ROOM_TOO_SMALL', roomCapacity: room.capacity, classMaxCapacity: cls.maxCapacity }]
        : [];
    return { cls, room, warnings };
  }

  private assertDaysInClassRange(cls: ClassDoc, days: string[]): void {
    const first = toDateOnly(cls.startDate);
    const last = toDateOnly(cls.endDate);
    if (days.some((d) => d < first || d > last)) throw new AppError(ErrorCode.SESSION_OUTSIDE_CLASS_RANGE);
  }

  private assertInClassRange(cls: ClassDoc, ranges: Range[]): void {
    this.assertDaysInClassRange(cls, ranges.flatMap((r) => [vnDay(r.startAt), vnDay(r.endAt)]));
  }

  /**
   * Serializes concurrent writers for the same class/room/teacher: bumping a shared counter doc forces a
   * write-write conflict, so the losing transaction aborts, is retried by withTransaction and then
   * sees the winner's insert in its conflict check. Call before assertNoConflicts; reused by S-03.
   */
  protected async lockSchedule(
    { classId, roomId, teacherId }: { classId: string; roomId: string; teacherId: string },
    s: ClientSession,
  ): Promise<void> {
    // The classes lane bumps the same class key on delete, so an insert racing a class delete conflicts too.
    await this.counters.next(`lock:class:${classId}`, s);
    await this.counters.next(`lock:room:${roomId}`, s);
    await this.counters.next(`lock:teacher:${teacherId}`, s);
  }

  /** Throws SCHEDULE_CONFLICT when the candidates clash with stored sessions or with each other. */
  private async assertNoConflicts(
    roomId: string,
    teacherId: string,
    ranges: Range[],
    cls: ClassDoc,
    s: ClientSession,
    excludeSessionId?: Types.ObjectId,
  ): Promise<void> {
    const conflicts = await this.collectConflicts(roomId, teacherId, ranges, cls, s, excludeSessionId);
    if (conflicts.length > 0) throw new AppError(ErrorCode.SCHEDULE_CONFLICT, undefined, { conflicts });
  }

  /** DB conflicts (inside the caller's transaction when given) plus conflicts among the candidates, ascending. */
  private async collectConflicts(
    roomId: string,
    teacherId: string,
    ranges: Range[],
    cls: ClassDoc,
    s?: ClientSession,
    excludeSessionId?: Types.ObjectId,
  ): Promise<SessionConflictDto[]> {
    const conflicts: SessionConflictDto[] = [];
    const seen = new Set<string>();
    for (const r of ranges) {
      const found = await this.checker.findConflicts(
        { roomId: new Types.ObjectId(roomId), teacherId: new Types.ObjectId(teacherId), ...r, ...(excludeSessionId ? { excludeSessionId } : {}) },
        s,
      );
      for (const c of found) {
        const key = `${c.sessionId ?? c.placementTestId}:${c.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push(c);
      }
    }
    // Defensive: expandWeekly never yields overlapping candidates, so this path is currently unreachable.
    const slots = ranges.map((r) => ({ roomId, teacherId, ...r }));
    slots.forEach((slot, i) => {
      for (const { slot: other, kind } of findSlotConflicts(slot, slots.slice(i + 1))) {
        conflicts.push({
          kind,
          classId: cls._id.toString(),
          classCode: cls.code,
          startAt: other.startAt.toISOString(),
          endAt: other.endAt.toISOString(),
          roomId,
          teacherId,
        });
      }
    });
    return conflicts.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
}
