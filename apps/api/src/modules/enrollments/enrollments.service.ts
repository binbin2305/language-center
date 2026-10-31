import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import {
  AuditAction,
  ChangeEnrollmentCourseInput,
  CourseStatus,
  CreateEnrollmentInput,
  EnrollmentDto,
  EnrollmentStatus,
  ErrorCode,
  ListEnrollmentsQuery,
  Role,
  SkipPlacementInput,
} from '@lc/shared';
import { withTransaction } from '../../common/db/transaction';
import { paginate } from '../../common/pagination';
import { Class } from '../../database/schemas/class.schema';
import { Course } from '../../database/schemas/course.schema';
import { Student } from '../../database/schemas/student.schema';
import { EnrollmentLabels, EnrollmentLean, toEnrollmentDto } from './enrollments.mapper';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
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
    if (!after) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);
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
