import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, isValidObjectId, Model, Types } from 'mongoose';
import {
  AssignClassInput,
  AuditAction,
  ClassStatus,
  EnrollmentDto,
  EnrollmentStatus,
  ErrorCode,
  NotificationRefType,
  NotificationType,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { INVOICE_CREATOR, InvoiceCreator } from '../../common/contracts/invoice-creator';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { Models } from '../../database/models';
import { Class, ClassDoc } from '../../database/schemas/class.schema';
import { Enrollment } from '../../database/schemas/enrollment.schema';
import { Student } from '../../database/schemas/student.schema';
import { EnrollmentsService } from './enrollments.service';

const OPEN_STATUSES: ClassStatus[] = [ClassStatus.PLANNED, ClassStatus.ONGOING];

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectConnection() private readonly conn: Connection,
    @Inject(INVOICE_CREATOR) private readonly invoices: InvoiceCreator,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
    private readonly notifications: NotificationsService,
    private readonly enrollmentsSvc: EnrollmentsService,
  ) {}

  /**
   * Takes one seat in a class inside the caller's transaction: validates course, then increments currentSize
   * atomically (ARCHITECTURE 4.5). Level rules are the caller's concern.
   * Callers MUST bump `lock:class:<id>` via CounterService.next for every class they touch (ascending id order)
   * BEFORE calling this, so the class is read after the lock.
   */
  async seat(enrollment: Pick<Enrollment, 'courseId'>, classId: Types.ObjectId, s: ClientSession): Promise<ClassDoc> {
    const before = await this.classes.findById(classId).session(s).select('courseId').lean();
    if (!before) throw new AppError(ErrorCode.NOT_FOUND);
    if (!before.courseId.equals(enrollment.courseId)) throw new AppError(ErrorCode.COURSE_MISMATCH);

    const cls = await this.classes.findOneAndUpdate(
      { _id: classId, status: { $in: OPEN_STATUSES }, $expr: { $lt: ['$currentSize', '$maxCapacity'] } },
      { $inc: { currentSize: 1 } },
      { new: true, session: s },
    );
    if (!cls) {
      // Re-read inside the txn to tell "not open" from "full".
      const now = await this.classes.findById(classId).session(s).select('status').lean();
      if (!now) throw new AppError(ErrorCode.NOT_FOUND);
      throw new AppError(OPEN_STATUSES.includes(now.status) ? ErrorCode.CLASS_FULL : ErrorCode.CLASS_NOT_OPEN);
    }
    return cls;
  }

  /** POST /enrollments/:id/assign */
  async assign(id: string, input: AssignClassInput, actor: AuthUser): Promise<EnrollmentDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const enrollmentId = new Types.ObjectId(id);
    const classId = new Types.ObjectId(input.classId);

    const { after, studentId } = await withTransaction(this.conn, async (s) => {
      await this.counters.next(`lock:class:${classId}`, s);
      const before = await this.enrollments.findById(enrollmentId).session(s).lean();
      if (!before) throw new AppError(ErrorCode.NOT_FOUND);
      if (before.status !== EnrollmentStatus.WAITING_CLASS) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);

      const target = await this.classes.findById(classId).session(s).select('courseId level').lean();
      if (!target) throw new AppError(ErrorCode.NOT_FOUND);
      const levelOverridden =
        target.courseId.equals(before.courseId) && !!before.placementLevel && before.placementLevel !== target.level;
      if (levelOverridden && !input.overrideReason) throw new AppError(ErrorCode.LEVEL_MISMATCH);

      const cls = await this.seat(before, classId, s);

      const now = this.clock.now();
      const set: Record<string, unknown> = { status: EnrollmentStatus.ENROLLED, classId: cls._id, enrolledAt: now };
      if (levelOverridden) set.levelOverride = { reason: input.overrideReason, by: actor.id, at: now };
      const claimed = await this.enrollments.findOneAndUpdate(
        { _id: enrollmentId, status: EnrollmentStatus.WAITING_CLASS },
        {
          $set: set,
          $push: { history: { from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: now, by: actor.id } },
        },
        { new: true, session: s },
      );
      if (!claimed) throw new AppError(ErrorCode.ENROLLMENT_INVALID_STATE);

      const invoiceId = await this.invoices.createForEnrollment(enrollmentId, s);
      const final = invoiceId
        ? await this.enrollments.findByIdAndUpdate(enrollmentId, { $set: { invoiceId } }, { new: true, session: s })
        : claimed;
      if (!final) throw new AppError(ErrorCode.NOT_FOUND);
      await this.audit.log(
        { actor, action: AuditAction.UPDATE, entity: 'enrollment', entityId: enrollmentId, before, after: final.toObject() },
        s,
      );
      return { after: final, studentId: before.studentId };
    });

    await this.notifyAssigned(studentId, after.classId!);
    return this.enrollmentsSvc.toDto(after);
  }

  /** After commit only; failures are logged, never thrown. */
  private async notifyAssigned(studentId: Types.ObjectId, classId: Types.ObjectId): Promise<void> {
    try {
      const [st, cls] = await Promise.all([
        this.students.findById(studentId).select('userId').lean(),
        this.classes.findById(classId).select('name').lean(),
      ]);
      if (!st?.userId) return;
      await this.notifications.notify([st.userId], {
        type: NotificationType.CLASS_ASSIGNED,
        title: 'Bạn đã được xếp lớp',
        body: `Bạn được xếp vào lớp ${cls?.name ?? ''}. Vui lòng xác nhận lớp học.`.trim(),
        refType: NotificationRefType.CLASS,
        refId: classId,
      });
    } catch (e) {
      this.logger.error('assign notify failed', e instanceof Error ? e.stack : String(e));
    }
  }
}
