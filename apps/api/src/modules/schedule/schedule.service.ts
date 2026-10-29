import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  AuditAction,
  type BulkCreateSessionsInput,
  type BulkCreateSessionsResultDto,
  type CheckConflictsInput,
  type CheckConflictsResultDto,
  type CreateSessionInput,
  type CreateSessionResultDto,
  ErrorCode,
  Role,
  RoomStatus,
  type SessionConflictDto,
  type SessionWarning,
  toDateOnly,
  UserStatus,
  vnDay,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { CounterService } from '../../common/db/counter.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { SCHEDULE_CONFLICT_CHECKER, type ScheduleConflictChecker } from '../../common/contracts/schedule-conflict-checker';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { Models } from '../../database/models';
import type { Class, ClassDoc } from '../../database/schemas/class.schema';
import type { Room, RoomDoc } from '../../database/schemas/room.schema';
import type { Session } from '../../database/schemas/session.schema';
import type { User } from '../../database/schemas/user.schema';
import { findSlotConflicts } from './conflict-checker';
import { expandWeekly } from './recurrence';
import { toSessionDto } from './schedule.mapper';

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
    @Inject(SCHEDULE_CONFLICT_CHECKER) private readonly checker: ScheduleConflictChecker,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
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

    return withTransaction(this.conn, async (s) => {
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
  }

  async createBulk(input: BulkCreateSessionsInput, actor: AuthUser): Promise<BulkCreateSessionsResultDto> {
    if (input.endTime <= input.startTime) throw fieldError('endTime', 'MUST_BE_AFTER_START');
    if (input.fromDate > input.toDate) throw fieldError('toDate', 'MUST_BE_ON_OR_AFTER_FROM');

    return withTransaction(this.conn, async (s) => {
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
  }

  private async resolve(
    input: { classId: string; roomId: string; teacherId: string },
    s: ClientSession,
  ): Promise<Resolved> {
    const [cls, room, teacher] = await Promise.all([
      this.classes.findById(input.classId).session(s),
      this.rooms.findById(input.roomId).session(s),
      this.users.findById(input.teacherId).session(s),
    ]);
    if (!cls) throw new AppError(ErrorCode.NOT_FOUND);
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

  /** Checks DB conflicts (inside the caller's transaction) and conflicts among the candidates themselves. */
  private async assertNoConflicts(
    roomId: string,
    teacherId: string,
    ranges: Range[],
    cls: ClassDoc,
    s: ClientSession,
  ): Promise<void> {
    const conflicts: SessionConflictDto[] = [];
    const seen = new Set<string>();
    for (const r of ranges) {
      const found = await this.checker.findConflicts(
        { roomId: new Types.ObjectId(roomId), teacherId: new Types.ObjectId(teacherId), ...r },
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
    if (conflicts.length > 0) {
      conflicts.sort((a, b) => a.startAt.localeCompare(b.startAt));
      throw new AppError(ErrorCode.SCHEDULE_CONFLICT, undefined, { conflicts });
    }
  }
}
