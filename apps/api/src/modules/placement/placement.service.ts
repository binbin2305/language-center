import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import {
  AddCandidatesInput,
  AuditAction,
  CourseStatus,
  CreatePlacementTestInput,
  EnrollmentStatus,
  ErrorCode,
  isValidScore,
  ListPlacementTestsQuery,
  PlacementStatus,
  PlacementTestDto,
  PutPlacementResultsInput,
  Role,
  RoomStatus,
  UpdatePlacementTestInput,
  UserStatus,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { SCHEDULE_CONFLICT_CHECKER, type ScheduleConflictChecker } from '../../common/contracts/schedule-conflict-checker';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { Models } from '../../database/models';
import type { Course } from '../../database/schemas/course.schema';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { PlacementCandidate, PlacementTest } from '../../database/schemas/placement-test.schema';
import type { Room } from '../../database/schemas/room.schema';
import type { Student } from '../../database/schemas/student.schema';
import type { User } from '../../database/schemas/user.schema';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { PlacementLean, toPlacementDto } from './placement.mapper';

const fieldError = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { [field]: message } });

@Injectable()
export class PlacementService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.PlacementTest) private readonly tests: Model<PlacementTest>,
    @InjectModel(Models.Course) private readonly courses: Model<Course>,
    @InjectModel(Models.Room) private readonly rooms: Model<Room>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @Inject(SCHEDULE_CONFLICT_CHECKER) private readonly checker: ScheduleConflictChecker,
    private readonly enrollmentsSvc: EnrollmentsService,
    private readonly counters: CounterService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
  ) {}

  async create(actor: AuthUser, input: CreatePlacementTestInput): Promise<PlacementTestDto> {
    const range = { startAt: new Date(input.startAt), endAt: new Date(input.endAt) };
    if (range.endAt <= range.startAt) throw fieldError('endAt', 'MUST_BE_AFTER_START');
    const created = await withTransaction(this.conn, async (s) => {
      const course = await this.courses.findById(input.courseId).session(s).lean();
      if (!course || course.status !== CourseStatus.ACTIVE) throw fieldError('courseId', 'Khóa học không tồn tại hoặc đã ngừng');
      await this.assertRoomAndTeacher(input.roomId, input.teacherId, s);
      await this.lockSchedule(input.roomId, input.teacherId, s);
      await this.assertNoConflicts(input.roomId, input.teacherId, range, s);
      const [doc] = await this.tests.create(
        [{ courseId: course._id, roomId: input.roomId, teacherId: input.teacherId, ...range }],
        { session: s },
      );
      await this.audit.log({ actor, action: AuditAction.CREATE, entity: Models.PlacementTest, entityId: doc._id, after: doc.toObject() }, s);
      return doc.toObject() as unknown as PlacementLean;
    });
    return this.one(created);
  }

  async update(actor: AuthUser, id: string, input: UpdatePlacementTestInput): Promise<PlacementTestDto> {
    const after = await withTransaction(this.conn, async (s) => {
      const current = await this.findOrThrow(id, undefined, s);
      if (current.status !== PlacementStatus.SCHEDULED) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const set: Partial<PlacementTest> = {};
      if (input.status !== undefined && input.status !== PlacementStatus.SCHEDULED) {
        if (input.status !== PlacementStatus.CANCELLED) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
        set.status = PlacementStatus.CANCELLED;
      }
      const merged = {
        roomId: input.roomId ?? current.roomId.toString(),
        teacherId: input.teacherId ?? current.teacherId.toString(),
        startAt: input.startAt ? new Date(input.startAt) : current.startAt,
        endAt: input.endAt ? new Date(input.endAt) : current.endAt,
      };
      const moved =
        input.roomId !== undefined || input.teacherId !== undefined || input.startAt !== undefined || input.endAt !== undefined;
      if (moved) {
        if (merged.endAt <= merged.startAt) throw fieldError('endAt', 'MUST_BE_AFTER_START');
        await this.assertRoomAndTeacher(merged.roomId, merged.teacherId, s);
        await this.lockSchedule(merged.roomId, merged.teacherId, s);
        if (set.status !== PlacementStatus.CANCELLED) {
          await this.assertNoConflicts(merged.roomId, merged.teacherId, merged, s, current._id);
        }
        Object.assign(set, {
          roomId: new Types.ObjectId(merged.roomId),
          teacherId: new Types.ObjectId(merged.teacherId),
          startAt: merged.startAt,
          endAt: merged.endAt,
        });
      }
      if (Object.keys(set).length === 0) return current;
      const updated = await this.tests
        .findOneAndUpdate({ _id: current._id, status: PlacementStatus.SCHEDULED }, { $set: set }, { new: true, session: s })
        .lean();
      if (!updated) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      await this.audit.log(
        { actor, action: AuditAction.UPDATE, entity: Models.PlacementTest, entityId: current._id, before: current, after: updated },
        s,
      );
      return updated as unknown as PlacementLean;
    });
    return this.one(after);
  }

  async list(user: AuthUser, q: ListPlacementTestsQuery) {
    const filter: FilterQuery<PlacementTest> = {};
    if (q.status) filter.status = q.status;
    if (q.courseId) filter.courseId = new Types.ObjectId(q.courseId);
    if (user.role === Role.TEACHER) filter.teacherId = user.id;
    else if (q.teacherId) filter.teacherId = new Types.ObjectId(q.teacherId);
    if (q.from || q.to) {
      filter.startAt = {
        ...(q.from ? { $gte: new Date(q.from) } : {}),
        ...(q.to ? { $lte: new Date(q.to) } : {}),
      };
    }
    const page = await paginate(this.tests, filter, { page: q.page, limit: q.limit, sort: q.sort ?? '-startAt' });
    return { data: await this.many(page.data as unknown as PlacementLean[]), meta: page.meta };
  }

  async get(user: AuthUser, id: string): Promise<PlacementTestDto> {
    return this.one(await this.findOrThrow(id, user));
  }

  /** POST /:id/candidates — idempotent per enrollment; one SCHEDULED test per enrollment at a time. */
  async addCandidates(actor: AuthUser, id: string, input: AddCandidatesInput): Promise<PlacementTestDto> {
    const after = await withTransaction(this.conn, async (s) => {
      const test = await this.findOrThrow(id, undefined, s);
      if (test.status !== PlacementStatus.SCHEDULED) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const have = new Set(test.candidates.map((c) => c.enrollmentId.toString()));
      const wanted = [...new Set(input.enrollmentIds)].filter((e) => !have.has(e));
      const toAdd: PlacementCandidate[] = [];
      for (const eid of wanted) {
        // Serializes the same enrollment being added to two tests concurrently.
        await this.counters.next(`lock:placement-enrollment:${eid}`, s);
        const e = await this.enrollments.findById(eid).session(s).lean();
        if (!e) throw new AppError(ErrorCode.NOT_FOUND);
        if (e.courseId.toString() !== test.courseId.toString()) throw new AppError(ErrorCode.COURSE_MISMATCH);
        if (e.status !== EnrollmentStatus.PENDING_PLACEMENT) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
        const other = await this.tests
          .exists({ _id: { $ne: test._id }, status: PlacementStatus.SCHEDULED, 'candidates.enrollmentId': e._id })
          .session(s);
        if (other) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
        toAdd.push({ enrollmentId: e._id, studentId: e.studentId, score: null, level: null, gradedAt: null, gradedBy: null });
      }
      if (toAdd.length === 0) return test;
      const updated = await this.tests
        .findOneAndUpdate({ _id: test._id }, { $push: { candidates: { $each: toAdd } } }, { new: true, session: s })
        .lean();
      await this.audit.log(
        { actor, action: AuditAction.UPDATE, entity: Models.PlacementTest, entityId: test._id, before: test, after: updated },
        s,
      );
      return updated as unknown as PlacementLean;
    });
    return this.one(after);
  }

  /** PUT /:id/results (D15) — overwrite per candidate; enrollment moves and test completion in one transaction. */
  async putResults(user: AuthUser, id: string, items: PutPlacementResultsInput): Promise<PlacementTestDto> {
    const after = await withTransaction(this.conn, async (s) => {
      const test = await this.findOrThrow(id, user, s);
      const bad = items.filter((i) => i.score !== null && !isValidScore(i.score)).map((i) => i.enrollmentId);
      if (bad.length > 0) throw new AppError(ErrorCode.SCORE_OUT_OF_RANGE, undefined, { enrollmentIds: bad });
      await this.counters.next(`lock:placement:${test._id}`, s);
      const fresh = await this.findOrThrow(id, user, s);
      if (fresh.status !== PlacementStatus.SCHEDULED) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const byId = new Map(fresh.candidates.map((c) => [c.enrollmentId.toString(), c]));
      for (const i of items) {
        if (!byId.has(i.enrollmentId)) throw fieldError('enrollmentId', 'Không phải thí sinh của đợt này');
      }
      const course = await this.courses.findById(fresh.courseId).session(s).select('levels').lean();
      const levels = new Set(course?.levels ?? []);
      for (const i of items) {
        if (i.level !== null && !levels.has(i.level)) throw fieldError('level', 'Trình độ không thuộc khóa học');
      }

      const now = this.clock.now();
      const latest = new Map(items.map((i) => [i.enrollmentId, i]));
      const invalid: string[] = [];
      const relevant = new Set<string>();
      const moves: Array<{ enrollmentId: string; level: string }> = [];
      for (const [eid, i] of latest) {
        const e = await this.enrollments.findById(eid).session(s).select('status placementSkipped').lean();
        const prev = byId.get(eid)!;
        const placedByThis = e?.status === EnrollmentStatus.WAITING_CLASS && !e.placementSkipped && prev.level !== null;
        const pending = e?.status === EnrollmentStatus.PENDING_PLACEMENT;
        if (!e || !(pending || placedByThis) || (placedByThis && (i.level === null || i.score === null))) invalid.push(eid);
        else if (i.score !== null && i.level !== null) moves.push({ enrollmentId: eid, level: i.level });
      }
      // R13: candidates whose enrollment left PENDING_PLACEMENT elsewhere (skipped, cancelled) do not block completion.
      for (const c of fresh.candidates) {
        const eid = c.enrollmentId.toString();
        if (latest.has(eid)) {
          relevant.add(eid);
          continue;
        }
        const e = await this.enrollments.findById(eid).session(s).select('status placementSkipped').lean();
        const pending = e?.status === EnrollmentStatus.PENDING_PLACEMENT;
        const placedByThis = e?.status === EnrollmentStatus.WAITING_CLASS && !e.placementSkipped && c.level !== null;
        if (pending || placedByThis) relevant.add(eid);
      }
      if (invalid.length > 0) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE, undefined, { enrollmentIds: invalid });
      for (const m of moves) await this.enrollmentsSvc.markPlaced(new Types.ObjectId(m.enrollmentId), m.level, user, s);

      const candidates = fresh.candidates.map((c) => {
        const i = latest.get(c.enrollmentId.toString());
        if (!i) return c;
        return {
          ...c,
          score: i.score,
          level: i.level,
          ...(i.comment !== undefined ? { comment: i.comment } : {}),
          gradedAt: now,
          gradedBy: user.id,
        };
      });
      const counted = candidates.filter((c) => relevant.has(c.enrollmentId.toString()));
      const complete = counted.length > 0 && counted.every((c) => c.score !== null && c.level !== null);
      const updated = await this.tests
        .findOneAndUpdate(
          { _id: fresh._id, status: PlacementStatus.SCHEDULED },
          { $set: { candidates, ...(complete ? { status: PlacementStatus.COMPLETED } : {}) } },
          { new: true, session: s },
        )
        .lean();
      if (!updated) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      await this.audit.log(
        { actor: user, action: AuditAction.UPDATE, entity: Models.PlacementTest, entityId: fresh._id, before: fresh, after: updated },
        s,
      );
      return updated as unknown as PlacementLean;
    });
    return this.one(after);
  }

  // ---- helpers ----

  private async findOrThrow(id: string, user?: AuthUser, s?: ClientSession): Promise<PlacementLean> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const filter: FilterQuery<PlacementTest> = { _id: new Types.ObjectId(id) };
    if (user?.role === Role.TEACHER) filter.teacherId = user.id;
    const doc = await this.tests.findOne(filter).session(s ?? null).lean();
    if (!doc) throw new AppError(ErrorCode.NOT_FOUND);
    return doc as unknown as PlacementLean;
  }

  private async assertRoomAndTeacher(roomId: string, teacherId: string, s: ClientSession): Promise<void> {
    const room = await this.rooms.findById(roomId).session(s).lean();
    if (!room || room.status !== RoomStatus.ACTIVE) throw fieldError('roomId', 'INVALID_ROOM');
    const teacher = await this.users.findById(teacherId).session(s).lean();
    if (!teacher || teacher.deletedAt || teacher.role !== Role.TEACHER || teacher.status !== UserStatus.ACTIVE) {
      throw fieldError('teacherId', 'NOT_AN_ACTIVE_TEACHER');
    }
  }

  /** Same protocol as ScheduleService.lockSchedule, without a class key: room, then teacher. */
  private async lockSchedule(roomId: string, teacherId: string, s: ClientSession): Promise<void> {
    await this.counters.next(`lock:room:${roomId}`, s);
    await this.counters.next(`lock:teacher:${teacherId}`, s);
  }

  private async assertNoConflicts(
    roomId: string,
    teacherId: string,
    range: { startAt: Date; endAt: Date },
    s: ClientSession,
    excludePlacementTestId?: Types.ObjectId,
  ): Promise<void> {
    const conflicts = await this.checker.findConflicts(
      {
        roomId: new Types.ObjectId(roomId),
        teacherId: new Types.ObjectId(teacherId),
        ...range,
        ...(excludePlacementTestId ? { excludePlacementTestId } : {}),
      },
      s,
    );
    if (conflicts.length > 0) throw new AppError(ErrorCode.SCHEDULE_CONFLICT, undefined, { conflicts });
  }

  private async one(row: PlacementLean): Promise<PlacementTestDto> {
    return (await this.many([row]))[0];
  }

  private async many(rows: PlacementLean[]): Promise<PlacementTestDto[]> {
    const ids = (xs: Types.ObjectId[]) => [...new Set(xs.map(String))].map((x) => new Types.ObjectId(x));
    const [courses, rooms, teachers, students] = await Promise.all([
      this.courses.find({ _id: { $in: ids(rows.map((r) => r.courseId)) } }).select('name').lean(),
      this.rooms.find({ _id: { $in: ids(rows.map((r) => r.roomId)) } }).select('code').lean(),
      this.users.find({ _id: { $in: ids(rows.map((r) => r.teacherId)) } }).select('fullName').lean(),
      this.students.find({ _id: { $in: ids(rows.flatMap((r) => r.candidates.map((c) => c.studentId))) } }).select('fullName code').lean(),
    ]);
    const cMap = new Map(courses.map((x) => [x._id.toString(), x.name]));
    const rMap = new Map(rooms.map((x) => [x._id.toString(), x.code]));
    const tMap = new Map(teachers.map((x) => [x._id.toString(), x.fullName]));
    const sMap = new Map(students.map((x) => [x._id.toString(), { fullName: x.fullName, code: x.code }]));
    return rows.map((r) =>
      toPlacementDto(r, {
        courseName: cMap.get(r.courseId.toString()),
        roomCode: rMap.get(r.roomId.toString()),
        teacherName: tMap.get(r.teacherId.toString()),
        students: sMap,
      }),
    );
  }
}
