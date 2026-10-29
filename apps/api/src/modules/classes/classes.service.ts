import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, isValidObjectId, Model, Types } from 'mongoose';
import {
  AuditAction,
  CLASS_TRANSITIONS,
  canTransition,
  ClassDependencyReason,
  ClassDto,
  ClassStatus,
  CourseStatus,
  CreateClassInput,
  DomainEvent,
  EnrollmentStatus,
  ErrorCode,
  fromDateOnly,
  Role,
  UpdateClassInput,
  UserStatus,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { Models } from '../../database/models';
import { Class } from '../../database/schemas/class.schema';
import { Assessment } from '../../database/schemas/assessment.schema';
import { Course } from '../../database/schemas/course.schema';
import { Enrollment } from '../../database/schemas/enrollment.schema';
import { Grade } from '../../database/schemas/grade.schema';
import { Invoice } from '../../database/schemas/invoice.schema';
import { Room } from '../../database/schemas/room.schema';
import { Session } from '../../database/schemas/session.schema';
import { User } from '../../database/schemas/user.schema';
import { ClassLean, toDto } from './classes.mapper';

type Fields = Record<string, string>;

function isDuplicateKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 11000;
}

function invalid(fields: Fields): AppError {
  return new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields });
}

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Course) private readonly courses: Model<Course>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectModel(Models.Room) private readonly rooms: Model<Room>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Session) private readonly sessions: Model<Session>,
    @InjectModel(Models.Assessment) private readonly assessments: Model<Assessment>,
    @InjectModel(Models.Grade) private readonly grades: Model<Grade>,
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    @InjectConnection() private readonly conn: Connection,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateClassInput, actor: AuthUser): Promise<ClassDto> {
    const fields: Fields = {};
    if (input.status && input.status !== ClassStatus.PLANNED)
      fields.status = 'Lớp mới phải ở trạng thái PLANNED';
    const startDate = fromDateOnly(input.startDate);
    const endDate = fromDateOnly(input.endDate);
    await this.validateRefs(
      {
        courseId: input.courseId,
        level: input.level,
        teacherId: input.teacherId,
        assistantTeacherId: input.assistantTeacherId,
        defaultRoomId: input.defaultRoomId,
        startDate,
        endDate,
      },
      fields,
    );
    if (Object.keys(fields).length) throw invalid(fields);

    try {
      const doc = await withTransaction(this.conn, async (s) => {
        const [created] = await this.classes.create(
          [
            {
              code: input.code,
              name: input.name,
              courseId: new Types.ObjectId(input.courseId),
              level: input.level,
              teacherId: new Types.ObjectId(input.teacherId),
              assistantTeacherId: input.assistantTeacherId
                ? new Types.ObjectId(input.assistantTeacherId)
                : null,
              defaultRoomId: input.defaultRoomId ? new Types.ObjectId(input.defaultRoomId) : null,
              maxCapacity: input.maxCapacity,
              startDate,
              endDate,
            },
          ],
          { session: s },
        );
        await this.audit.log(
          {
            actor,
            action: AuditAction.CREATE,
            entity: 'class',
            entityId: created._id,
            after: created.toObject(),
          },
          s,
        );
        return created;
      });
      return this.present(doc.toObject() as unknown as ClassLean);
    } catch (e) {
      if (isDuplicateKey(e)) throw new AppError(ErrorCode.CLASS_CODE_EXISTS);
      throw e;
    }
  }

  async get(id: string): Promise<ClassDto> {
    return this.present(await this.load(id));
  }

  async update(id: string, input: UpdateClassInput, actor: AuthUser): Promise<ClassDto> {
    const before = await this.load(id);
    const merged = {
      courseId: input.courseId ?? before.courseId.toString(),
      level: input.level ?? before.level,
      teacherId: input.teacherId ?? before.teacherId.toString(),
      assistantTeacherId:
        input.assistantTeacherId === undefined
          ? before.assistantTeacherId?.toString()
          : input.assistantTeacherId,
      defaultRoomId:
        input.defaultRoomId === undefined ? before.defaultRoomId?.toString() : input.defaultRoomId,
      startDate: input.startDate ? fromDateOnly(input.startDate) : before.startDate,
      endDate: input.endDate ? fromDateOnly(input.endDate) : before.endDate,
    };
    const fields: Fields = {};
    // Only re-validate references that this request actually touches.
    const touched = (k: keyof UpdateClassInput) => input[k] !== undefined;
    await this.validateRefs(
      merged,
      fields,
      {
        course: touched('courseId') || touched('level'),
        teacher: touched('teacherId'),
        assistant: touched('assistantTeacherId'),
        room: touched('defaultRoomId'),
      },
      touched('startDate') || touched('endDate'),
    );
    if (Object.keys(fields).length) throw invalid(fields);

    const statusChange = input.status !== undefined && input.status !== before.status;
    // FINISHED is terminal: even re-sending FINISHED is rejected.
    const terminalResend =
      input.status === ClassStatus.FINISHED && before.status === ClassStatus.FINISHED;
    if (terminalResend) {
      throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION, undefined, {
        from: before.status,
        to: input.status,
      });
    }
    if (
      statusChange &&
      !canTransition(CLASS_TRANSITIONS, before.status, input.status as ClassStatus)
    ) {
      throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION, undefined, {
        from: before.status,
        to: input.status,
      });
    }

    const set: Record<string, unknown> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.courseId !== undefined) set.courseId = new Types.ObjectId(input.courseId);
    if (input.level !== undefined) set.level = input.level;
    if (input.teacherId !== undefined) set.teacherId = new Types.ObjectId(input.teacherId);
    if (input.assistantTeacherId !== undefined)
      set.assistantTeacherId = input.assistantTeacherId
        ? new Types.ObjectId(input.assistantTeacherId)
        : null;
    if (input.defaultRoomId !== undefined)
      set.defaultRoomId = input.defaultRoomId ? new Types.ObjectId(input.defaultRoomId) : null;
    if (input.maxCapacity !== undefined) set.maxCapacity = input.maxCapacity;
    if (input.startDate !== undefined) set.startDate = merged.startDate;
    if (input.endDate !== undefined) set.endDate = merged.endDate;
    if (statusChange) set.status = input.status;

    // Guards live in the filter so nothing is read-then-written.
    const filter: Record<string, unknown> = { _id: before._id };
    if (statusChange) filter.status = before.status;
    if (input.maxCapacity !== undefined) filter.currentSize = { $lte: input.maxCapacity };

    const after = await withTransaction(this.conn, async (s) => {
      const updated = await this.classes
        .findOneAndUpdate(filter, { $set: set }, { new: true, session: s, runValidators: true })
        .lean<ClassLean>();
      if (!updated) return null;
      await this.audit.log(
        {
          actor,
          action: statusChange ? AuditAction.STATUS : AuditAction.UPDATE,
          entity: 'class',
          entityId: updated._id,
          before,
          after: updated,
        },
        s,
      );
      return updated;
    });

    if (!after) throw await this.explainFailedUpdate(before, input);
    if (statusChange && after.status === ClassStatus.FINISHED) {
      try {
        await this.events.emitAsync(DomainEvent.ClassFinished, {
          classId: after._id.toString(),
          at: this.clock.now(),
          actorId: actor.id.toString(),
        });
      } catch (e) {
        // The update is already committed; a failing listener must not turn it into a 500.
        this.logger.error(
          `class.finished listener failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
        );
      }
    }
    return this.present(after);
  }

  /** Deactivate goes through the same guarded transition path as PATCH status. */
  deactivate(id: string, actor: AuthUser): Promise<ClassDto> {
    return this.update(id, { status: ClassStatus.INACTIVE }, actor);
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const before = await this.load(id);
    await withTransaction(this.conn, async (s) => {
      // Delete first: the write on the class document serialises against concurrent
      // writers, then dependencies are re-checked inside the same transaction.
      const del = await this.classes.deleteOne({ _id: before._id }, { session: s });
      if (del.deletedCount === 0) throw new AppError(ErrorCode.NOT_FOUND);
      const reasons = await this.dependencyReasons(before._id, s);
      if (reasons.length) {
        throw new AppError(ErrorCode.CLASS_HAS_DEPENDENCIES, undefined, { reasons });
      }
      await this.audit.log(
        { actor, action: AuditAction.DELETE, entity: 'class', entityId: before._id, before },
        s,
      );
    });
  }

  private async dependencyReasons(
    classId: Types.ObjectId,
    session: ClientSession,
  ): Promise<ClassDependencyReason[]> {
    const opt = { session };
    const [active, history, sessions, assessment, grade, invoice] = await Promise.all([
      this.enrollments.exists({ classId, status: EnrollmentStatus.ENROLLED }).session(session),
      this.enrollments
        .exists({ classId, status: { $ne: EnrollmentStatus.ENROLLED } })
        .session(session),
      this.sessions.exists({ classId }).session(session),
      this.assessments.find({ classId }, { _id: 1 }, opt).lean(),
      this.grades.exists({ classId }).session(session),
      this.invoices.exists({ classId }).session(session),
    ]);
    // Grades belong to a class through its assessments (grade.classId is denormalised).
    const viaAssessment = assessment.length
      ? await this.grades
          .exists({ assessmentId: { $in: assessment.map((a) => a._id) } })
          .session(session)
      : null;
    const reasons: ClassDependencyReason[] = [];
    if (active) reasons.push('ACTIVE_STUDENTS');
    if (history) reasons.push('ENROLLMENT_HISTORY');
    if (sessions) reasons.push('SESSIONS');
    if (grade || viaAssessment) reasons.push('GRADES');
    if (invoice) reasons.push('INVOICES');
    return reasons;
  }

  /** The guarded update matched nothing: find out which guard lost the race. */
  private async explainFailedUpdate(before: ClassLean, input: UpdateClassInput): Promise<AppError> {
    const now = await this.classes.findById(before._id).lean<ClassLean>();
    if (!now) return new AppError(ErrorCode.NOT_FOUND);
    if (now.status !== before.status) {
      return new AppError(ErrorCode.INVALID_STATUS_TRANSITION, undefined, {
        from: now.status,
        to: input.status,
      });
    }
    return new AppError(ErrorCode.CAPACITY_BELOW_CURRENT, undefined, {
      currentSize: now.currentSize,
    });
  }

  private async load(id: string): Promise<ClassLean> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const c = await this.classes.findById(id).lean<ClassLean>();
    if (!c) throw new AppError(ErrorCode.NOT_FOUND);
    return c;
  }

  private async validateRefs(
    v: {
      courseId: string;
      level: string;
      teacherId: string;
      assistantTeacherId?: string | null;
      defaultRoomId?: string | null;
      startDate: Date;
      endDate: Date;
    },
    fields: Fields,
    only: { course: boolean; teacher: boolean; assistant: boolean; room: boolean } = {
      course: true,
      teacher: true,
      assistant: true,
      room: true,
    },
    checkDates = true,
  ): Promise<void> {
    if (checkDates && v.endDate < v.startDate)
      fields.endDate = 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu';
    if (only.course) {
      const course = await this.courses.findById(v.courseId).lean();
      if (!course) fields.courseId = 'Khóa học không tồn tại';
      else {
        if (course.status === CourseStatus.ARCHIVED) fields.courseId = 'Khóa học đã lưu trữ';
        if (!course.levels.includes(v.level)) fields.level = 'Trình độ không thuộc khóa học';
      }
    }
    if (only.teacher) await this.checkTeacher(v.teacherId, 'teacherId', fields);
    if (only.assistant && v.assistantTeacherId)
      await this.checkTeacher(v.assistantTeacherId, 'assistantTeacherId', fields);
    if (only.room && v.defaultRoomId) {
      if (!(await this.rooms.exists({ _id: v.defaultRoomId })))
        fields.defaultRoomId = 'Phòng học không tồn tại';
    }
  }

  private async checkTeacher(id: string, field: string, fields: Fields): Promise<void> {
    const u = await this.users.findById(id).lean();
    if (!u || u.deletedAt || u.role !== Role.TEACHER || u.status !== UserStatus.ACTIVE) {
      fields[field] = 'Phải là giáo viên đang hoạt động';
    }
  }

  private async present(c: ClassLean): Promise<ClassDto> {
    const [course, teacher] = await Promise.all([
      this.courses.findById(c.courseId, { name: 1 }).lean(),
      this.users.findById(c.teacherId, { fullName: 1 }).lean(),
    ]);
    return toDto(c, { courseName: course?.name, teacherName: teacher?.fullName });
  }
}
