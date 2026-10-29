import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EnrollmentStatus, NotificationRefType, NotificationType, VN_TZ, vnDay } from '@lc/shared';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { Models } from '../../database/models';
import type { Class } from '../../database/schemas/class.schema';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { Student } from '../../database/schemas/student.schema';

const HHMM = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** 'dd/MM/yyyy' of the instant in Vietnam time. */
const fmtDay = (d: Date): string => vnDay(d).split('-').reverse().join('/');
/** 'HH:mm dd/MM/yyyy' of the instant in Vietnam time. */
const fmtDateTime = (d: Date): string => `${HHMM.format(d)} ${fmtDay(d)}`;

interface SessionRef {
  id: Types.ObjectId | string;
  classId: Types.ObjectId | string;
  startAt: Date;
  /** Session's own teacher (may be a substitute) plus any extra people to notify, e.g. the previous teacher. */
  extraRecipients?: Array<Types.ObjectId | string>;
}

/**
 * Sends schedule notifications to a class's teachers and ENROLLED students. Call only after the
 * writing transaction has committed; failures are logged and never propagate to the caller.
 */
@Injectable()
export class ScheduleNotifier {
  private readonly logger = new Logger(ScheduleNotifier.name);

  constructor(
    private readonly notifications: NotificationsService,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
  ) {}

  sessionCreated(s: SessionRef) {
    return this.forSession(s, NotificationType.SESSION_CREATED, 'Lịch học mới', (code) => `Lớp ${code}: ${fmtDateTime(s.startAt)}`);
  }

  sessionUpdated(s: SessionRef) {
    return this.forSession(s, NotificationType.SESSION_UPDATED, 'Lịch học thay đổi', (code) => `Lớp ${code}: ${fmtDateTime(s.startAt)}`);
  }

  sessionCancelled(s: SessionRef, reason: string) {
    return this.forSession(
      s,
      NotificationType.SESSION_CANCELLED,
      'Buổi học bị hủy',
      (code) => `Lớp ${code}: ${fmtDateTime(s.startAt)}. Lý do: ${reason}`,
    );
  }

  /** One notification per recipient for a whole series. */
  seriesCreated(classId: Types.ObjectId | string, count: number, first: Date, last: Date) {
    return this.forClass(classId, NotificationType.SESSION_CREATED, 'Lịch học mới', (code) =>
      `Lớp ${code}: ${count} buổi từ ${fmtDay(first)} đến ${fmtDay(last)}`,
    );
  }

  futureCancelled(classId: Types.ObjectId | string, count: number, reason: string) {
    return this.forClass(classId, NotificationType.SESSION_CANCELLED, 'Các buổi học bị hủy', (code) =>
      `Lớp ${code}: đã hủy ${count} buổi sắp tới. Lý do: ${reason}`,
    );
  }

  private forSession(s: SessionRef, type: NotificationType, title: string, body: (code: string) => string) {
    return this.send(s.classId, type, title, body, NotificationRefType.SESSION, s.id, s.extraRecipients);
  }

  private forClass(classId: Types.ObjectId | string, type: NotificationType, title: string, body: (code: string) => string) {
    return this.send(classId, type, title, body, NotificationRefType.CLASS, classId);
  }

  private async send(
    classId: Types.ObjectId | string,
    type: NotificationType,
    title: string,
    body: (code: string) => string,
    refType: NotificationRefType,
    refId: Types.ObjectId | string,
    extra: Array<Types.ObjectId | string> = [],
  ): Promise<void> {
    try {
      const cls = await this.classes.findById(classId, { code: 1, teacherId: 1, assistantTeacherId: 1 }).lean();
      if (!cls) return;
      const rows = await this.enrollments.find({ classId: cls._id, status: EnrollmentStatus.ENROLLED }, { studentId: 1 }).lean();
      const studentUsers = rows.length
        ? await this.students.find({ _id: { $in: rows.map((r) => r.studentId) }, userId: { $exists: true } }, { userId: 1 }).lean()
        : [];
      const recipients = [cls.teacherId, cls.assistantTeacherId, ...studentUsers.map((u) => u.userId), ...extra.map((e) => new Types.ObjectId(String(e)))].filter(
        (id): id is Types.ObjectId => !!id,
      );
      await this.notifications.notify(recipients, { type, title, body: body(cls.code), refType, refId: new Types.ObjectId(String(refId)) });
    } catch (err) {
      this.logger.error(`Schedule notification (${type}) failed for class ${String(classId)}`, err instanceof Error ? err.stack : String(err));
    }
  }
}
