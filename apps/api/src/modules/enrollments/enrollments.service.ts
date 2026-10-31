import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import {
  AuditAction,
  canTransition,
  ChangeEnrollmentCourseInput,
  ENROLLMENT_TRANSITIONS,
  CourseStatus,
  CreateEnrollmentInput,
  EnrollmentDto,
  EnrollmentStatus,
  ErrorCode,
  ListEnrollmentsQuery,
  ListWaitingEnrollmentsQuery,
  Role,
  SkipPlacementInput,
  vnDay,
  WaitingEnrollmentDto,
  WithdrawEnrollmentInput,
} from '@lc/shared';
import { INVOICE_CREATOR, InvoiceCreator } from '../../common/contracts/invoice-creator';
import { withTransaction } from '../../common/db/transaction';
import { paginate } from '../../common/pagination';
import { Class } from '../../database/schemas/class.schema';
import { Course } from '../../database/schemas/course.schema';
import { Student } from '../../database/schemas/student.schema';
import { EnrollmentLabels, EnrollmentLean, toEnrollmentDto } from './enrollments.mapper';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { CounterService } from '../../common/db/counter.service';
import { ClockService } from '../../common/clock/clock.service';
import { AppError } from '../../common/errors/app-error';
import { ACTIVE_ENROLLMENT_STATUSES } from '../../database/active-enrollment';
import { Models } from '../../database/models';
import { Enrollment, EnrollmentDoc } from '../../database/schemas/enrollment.schema';
import { isDuplicateKey } from '../../common/util/is-duplicate-key';

const SORTS = new Set(['createdAt', '-createdAt', 'updatedAt', '-updatedAt']);

@Injectable()
export class EnrollmentsService {
  constructor(
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.Course) private readonly courses: Model<Course>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectConnection() private readonly conn: Connection,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
    @Inject(INVOICE_CREATOR) private readonly invoices: InvoiceCreator,
  ) {}

  async createPending(
    studentId: Types.ObjectId,
    courseId: Types.ObjectId,
    actor: AuthUser,
    s?: ClientSession,
  ): Promise<EnrollmentDoc> {
    const active = await this.enrollments.exists({ studentId, courseId, status: { $in: ACTIVE_ENROLLMENT_STATUSES } }).session(s ?? null);
    if (active) throw new AppError(ErrorCode.ENROLLMENT_EXISTS);

    let created: EnrollmentDoc;
    try {
      [created] = await this.enrollments.create(
        [
          {
            studentId,
            courseId,
            status: EnrollmentStatus.PENDING_PLACEMENT,
            history: [{ from: null, to: EnrollmentStatus.PENDING_PLACEMENT, at: this.clock.now(), by: actor.id }],
          },
        ],
        { session: s },
      );
    } catch (e) {
      // The partial unique index is the authority when two requests race past the check above.
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.ENROLLMENT_EXISTS);
      throw e;
    }
    await this.audit.log(
      { actor, action: AuditAction.CREATE, entity: 'enrollment', entityId: created._id, after: created.toObject() },
      s,
    );
    return created;
  }

  private fieldError(field: string, message: string): AppError {
    return new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { [field]: message } });
  }

  private async assertActiveCourse(courseId: string): Promise<Types.ObjectId> {
    const course = await this.courses.findById(courseId).select('status').lean();
    if (!course || course.status !== CourseStatus.ACTIVE) throw this.fieldError('courseId', 'Khóa học không tồn tại hoặc đã ngừng');
    return course._id;
  }

  /** POST /enrollments — STUDENT registers themself; staff registers a student. */
  async create(user: AuthUser, input: CreateEnrollmentInput): Promise<EnrollmentDto> {
    let studentId: Types.ObjectId;
    if (user.role === Role.STUDENT) {
      if (!user.studentId) throw this.fieldError('studentId', 'Tài khoản chưa gắn hồ sơ học viên');
      if (input.studentId && input.studentId !== user.studentId.toString()) {
        throw this.fieldError('studentId', 'Chỉ được đăng ký cho chính mình');
      }
      studentId = user.studentId;
    } else {
      if (!input.studentId) throw this.fieldError('studentId', 'Bắt buộc');
      const st = await this.students.findOne({ _id: input.studentId, deletedAt: null }).select('_id').lean();
      if (!st) throw this.fieldError('studentId', 'Học viên không tồn tại');
      studentId = st._id;
    }
    const courseId = await this.assertActiveCourse(input.courseId);
    const created = await withTransaction(this.conn, (s) => this.createPending(studentId, courseId, user, s));
    const [dto] = await this.toDtos([created.toObject() as unknown as EnrollmentLean]);
    return dto;
  }

  async list(q: ListEnrollmentsQuery) {
    const filter: FilterQuery<Enrollment> = {};
    if (q.status) filter.status = q.status;
    if (q.courseId) filter.courseId = new Types.ObjectId(q.courseId);
    if (q.classId) filter.classId = new Types.ObjectId(q.classId);
    if (q.studentId) filter.studentId = new Types.ObjectId(q.studentId);
    const page = await paginate(this.enrollments, filter, { page: q.page, limit: q.limit, sort: q.sort && SORTS.has(q.sort) ? q.sort : '-createdAt' });
    return { data: await this.toDtos(page.data as unknown as EnrollmentLean[]), meta: page.meta };
  }

  async me(user: AuthUser): Promise<EnrollmentDto[]> {
    if (!user.studentId) return [];
    const rows = await this.enrollments.find({ studentId: user.studentId }).sort({ createdAt: -1, _id: -1 }).lean();
    return this.toDtos(rows as unknown as EnrollmentLean[], false);
  }

  /** PATCH /enrollments/:id/course — only while PENDING_PLACEMENT. */
  async changeCourse(user: AuthUser, id: string, input: ChangeEnrollmentCourseInput): Promise<EnrollmentDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const scope: FilterQuery<Enrollment> = { _id: new Types.ObjectId(id) };
    if (user.role === Role.STUDENT) {
      if (!user.studentId) throw new AppError(ErrorCode.NOT_FOUND);
      scope.studentId = user.studentId;
    }
    const before = await this.enrollments.findOne(scope).lean();
    if (!before) throw new AppError(ErrorCode.NOT_FOUND);
    const courseId = await this.assertActiveCourse(input.courseId);

    try {
      const after = await withTransaction(this.conn, async (s) => {
        const updated = await this.enrollments
          .findOneAndUpdate(
            { ...scope, status: EnrollmentStatus.PENDING_PLACEMENT },
            {
              $set: { courseId },
              $push: {
                history: {
                  from: EnrollmentStatus.PENDING_PLACEMENT,
                  to: EnrollmentStatus.PENDING_PLACEMENT,
                  at: this.clock.now(),
                  by: user.id,
                  reason: 'COURSE_CHANGED',
                },
              },
            },
            { new: true, session: s },
          )
          .lean();
        if (!updated) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
        await this.audit.log(
          { actor: user, action: AuditAction.UPDATE, entity: 'enrollment', entityId: updated._id, before, after: updated },
          s,
        );
        return updated;
      });
      const [dto] = await this.toDtos([after as unknown as EnrollmentLean]);
      return dto;
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.ENROLLMENT_EXISTS);
      throw e;
    }
  }

  /**
   * D15: PENDING_PLACEMENT -> WAITING_CLASS from a placement result; an enrollment already placed by a test
   * (not skipped) only gets its level updated. Runs inside the caller's transaction.
   */
  async markPlaced(enrollmentId: Types.ObjectId, level: string, actor: AuthUser, s: ClientSession): Promise<void> {
    const before = await this.enrollments.findById(enrollmentId).session(s).lean();
    const now = this.clock.now();
    const moved = await this.enrollments
      .findOneAndUpdate(
        { _id: enrollmentId, status: EnrollmentStatus.PENDING_PLACEMENT },
        {
          $set: { status: EnrollmentStatus.WAITING_CLASS, placementLevel: level, waitingSince: now },
          $push: { history: { from: EnrollmentStatus.PENDING_PLACEMENT, to: EnrollmentStatus.WAITING_CLASS, at: now, by: actor.id } },
        },
        { new: true, session: s },
      )
      .lean();
    const after =
      moved ??
      (await this.enrollments
        .findOneAndUpdate(
          { _id: enrollmentId, status: EnrollmentStatus.WAITING_CLASS, placementSkipped: null },
          { $set: { placementLevel: level } },
          { new: true, session: s },
        )
        .lean());
    if (!after) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE, undefined, { enrollmentIds: [enrollmentId.toString()] });
    await this.audit.log(
      { actor, action: AuditAction.UPDATE, entity: 'enrollment', entityId: enrollmentId, before, after },
      s,
    );
  }

  /** POST /enrollments/:id/skip-placement */
  async skipPlacement(id: string, input: SkipPlacementInput, actor: AuthUser): Promise<EnrollmentDoc> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const reason = input.reason.trim();
    if (!reason) throw new AppError(ErrorCode.REASON_REQUIRED);
    return withTransaction(this.conn, async (s) => {
      // Serializes with PlacementService.addCandidates for the same enrollment.
      await this.counters.next(`lock:placement-enrollment:${id}`, s);
      const before = await this.enrollments.findById(id).session(s).lean();
      if (!before) throw new AppError(ErrorCode.NOT_FOUND);
      const course = await this.courses.findById(before.courseId).session(s).select('levels').lean();
      if (!course?.levels.includes(input.level)) throw this.fieldError('level', 'Trình độ không thuộc khóa học');
      const now = this.clock.now();
      const updated = await this.enrollments.findOneAndUpdate(
        { _id: before._id, status: EnrollmentStatus.PENDING_PLACEMENT },
        {
          $set: {
            status: EnrollmentStatus.WAITING_CLASS,
            placementLevel: input.level,
            placementSkipped: { reason, by: actor.id, at: now },
            waitingSince: now,
          },
          $push: {
            history: { from: EnrollmentStatus.PENDING_PLACEMENT, to: EnrollmentStatus.WAITING_CLASS, at: now, by: actor.id, reason },
          },
        },
        { new: true, session: s },
      );
      if (!updated) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
      await this.audit.log(
        { actor, action: AuditAction.UPDATE, entity: 'enrollment', entityId: updated._id, before, after: updated.toObject() },
        s,
      );
      return updated;
    });
  }

  /** POST /enrollments/:id/withdraw — ENROLLED -> CANCELLED|RESERVED frees a seat; CANCELLED also voids the invoice. */
  async withdraw(id: string, input: WithdrawEnrollmentInput, actor: AuthUser): Promise<EnrollmentDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const reason = input.reason.trim();
    if (!reason) throw new AppError(ErrorCode.REASON_REQUIRED);
    const enrollmentId = new Types.ObjectId(id);
    // An ENROLLED enrollment's classId never changes, so the peek tells which class lock to take.
    const peek = await this.enrollments.findById(enrollmentId).select('classId status').lean();
    if (!peek) throw new AppError(ErrorCode.NOT_FOUND);

    const after = await withTransaction(this.conn, async (s) => {
      if (peek.status === EnrollmentStatus.ENROLLED && peek.classId) await this.counters.next(`lock:class:${peek.classId}`, s);
      const before = await this.enrollments.findById(enrollmentId).session(s).lean();
      if (!before) throw new AppError(ErrorCode.NOT_FOUND);
      if (!canTransition(ENROLLMENT_TRANSITIONS, before.status, input.status)) {
        throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      }
      const now = this.clock.now();
      const claimed = await this.enrollments.findOneAndUpdate(
        { _id: enrollmentId, status: before.status },
        {
          $set: { status: input.status },
          $push: { history: { from: before.status, to: input.status, at: now, by: actor.id, reason } },
        },
        { new: true, session: s },
      );
      if (!claimed) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
      if (before.status === EnrollmentStatus.ENROLLED) {
        if (before.classId) await this.releaseSeat(before.classId, s);
        if (input.status === EnrollmentStatus.CANCELLED) await this.invoices.voidForEnrollment(enrollmentId, reason, s);
      }
      await this.audit.log(
        { actor, action: AuditAction.UPDATE, entity: 'enrollment', entityId: enrollmentId, before, after: claimed.toObject() },
        s,
      );
      return claimed;
    });
    return this.toDto(after);
  }

  /** Atomic seat release; never drops below zero. Caller holds lock:class:<id>. */
  async releaseSeat(classId: Types.ObjectId, s: ClientSession): Promise<void> {
    await this.classes.findOneAndUpdate({ _id: classId, currentSize: { $gt: 0 } }, { $inc: { currentSize: -1 } }, { session: s });
  }

  /** POST /enrollments/:id/resume — RESERVED -> WAITING_CLASS. */
  async resume(id: string, actor: AuthUser): Promise<EnrollmentDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const enrollmentId = new Types.ObjectId(id);
    try {
      const after = await withTransaction(this.conn, async (s) => {
        const before = await this.enrollments.findById(enrollmentId).session(s).lean();
        if (!before) throw new AppError(ErrorCode.NOT_FOUND);
        if (before.status !== EnrollmentStatus.RESERVED) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
        const now = this.clock.now();
        const claimed = await this.enrollments.findOneAndUpdate(
          { _id: enrollmentId, status: EnrollmentStatus.RESERVED },
          {
            $set: { status: EnrollmentStatus.WAITING_CLASS, classId: null, waitingSince: now },
            $push: { history: { from: EnrollmentStatus.RESERVED, to: EnrollmentStatus.WAITING_CLASS, at: now, by: actor.id } },
          },
          { new: true, session: s },
        );
        if (!claimed) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
        await this.audit.log(
          { actor, action: AuditAction.UPDATE, entity: 'enrollment', entityId: enrollmentId, before, after: claimed.toObject() },
          s,
        );
        return claimed;
      });
      return await this.toDto(after);
    } catch (e) {
      // The student registered again for the same course while reserved.
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.ENROLLMENT_EXISTS);
      throw e;
    }
  }

  /** POST /enrollments/:id/confirm — a student confirms their own ENROLLED class. */
  async confirm(user: AuthUser, id: string): Promise<EnrollmentDto> {
    if (!isValidObjectId(id) || !user.studentId) throw new AppError(ErrorCode.NOT_FOUND);
    const scope = { _id: new Types.ObjectId(id), studentId: user.studentId };
    const before = await this.enrollments.findOne(scope).lean();
    if (!before) throw new AppError(ErrorCode.NOT_FOUND);
    const after = await withTransaction(this.conn, async (s) => {
      const updated = await this.enrollments.findOneAndUpdate(
        { ...scope, status: EnrollmentStatus.ENROLLED },
        { $set: { confirmedAt: this.clock.now() } },
        { new: true, session: s },
      );
      if (!updated) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
      await this.audit.log(
        { actor: user, action: AuditAction.UPDATE, entity: 'enrollment', entityId: updated._id, before, after: updated.toObject() },
        s,
      );
      return updated;
    });
    return this.toDto(after);
  }

  /** GET /enrollments/waiting */
  async waiting(q: ListWaitingEnrollmentsQuery) {
    const filter: FilterQuery<Enrollment> = { status: EnrollmentStatus.WAITING_CLASS };
    if (q.courseId) filter.courseId = new Types.ObjectId(q.courseId);
    const page = await paginate(this.enrollments, filter, { page: q.page, limit: q.limit, sort: 'waitingSince' });
    const rows = page.data as unknown as EnrollmentLean[];
    const dtos = await this.toDtos(rows);
    const today = vnDay(this.clock.now());
    const data: WaitingEnrollmentDto[] = dtos.map((d, i) => {
      const since = rows[i].waitingSince;
      const days = since ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${vnDay(since)}T00:00:00Z`)) / 86_400_000) : 0;
      return { ...d, waitingDays: Math.max(0, days) };
    });
    return { data, meta: page.meta };
  }

  async toDto(doc: EnrollmentDoc): Promise<EnrollmentDto> {
    const [dto] = await this.toDtos([doc.toObject() as unknown as EnrollmentLean]);
    return dto;
  }

  /** Batch-resolves student/course/class labels for a page of enrollments. */
  private async toDtos(rows: EnrollmentLean[], withStudent = true): Promise<EnrollmentDto[]> {
    const uniq = (ids: Array<Types.ObjectId | null | undefined>) => [...new Map(ids.filter((x): x is Types.ObjectId => !!x).map((x) => [x.toString(), x])).values()];
    const [students, courses, classes] = await Promise.all([
      withStudent
        ? this.students.find({ _id: { $in: uniq(rows.map((r) => r.studentId)) } }).select('fullName code').lean()
        : Promise.resolve([]),
      this.courses.find({ _id: { $in: uniq(rows.map((r) => r.courseId)) } }).select('name').lean(),
      this.classes.find({ _id: { $in: uniq(rows.map((r) => r.classId)) } }).select('name').lean(),
    ]);
    const sMap = new Map(students.map((x) => [x._id.toString(), x]));
    const cMap = new Map(courses.map((x) => [x._id.toString(), x.name]));
    const kMap = new Map(classes.map((x) => [x._id.toString(), x.name]));
    return rows.map((r) => {
      const labels: EnrollmentLabels = { courseName: cMap.get(r.courseId.toString()) };
      if (withStudent) {
        const st = sMap.get(r.studentId.toString());
        labels.studentName = st?.fullName;
        labels.studentCode = st?.code;
      }
      if (r.classId) labels.className = kMap.get(r.classId.toString());
      return toEnrollmentDto(r, labels);
    });
  }
}
