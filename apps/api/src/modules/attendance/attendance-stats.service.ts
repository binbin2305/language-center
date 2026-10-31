import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { Model, Types } from 'mongoose';
import {
  absenceRate,
  AttendanceStatus,
  DomainEvent,
  NotificationRefType,
  NotificationType,
  Role,
  UserStatus,
  type AttendanceCounts,
} from '@lc/shared';
import { ClockService } from '../../common/clock/clock.service';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { SettingsService } from '../../common/settings/settings.service';
import { isDuplicateKey } from '../../common/util/is-duplicate-key';
import { Models } from '../../database/models';
import type { Attendance } from '../../database/schemas/attendance.schema';
import type { AttendanceWarning } from '../../database/schemas/attendance-warning.schema';
import type { Student } from '../../database/schemas/student.schema';
import type { User } from '../../database/schemas/user.schema';

export interface AttendanceRecordedPayload {
  sessionId: string;
  classId: string;
  studentIds: string[];
}

/** FR-ATT-05 (D17): per-class absence rates and the warning lifecycle. */
@Injectable()
export class AttendanceStatsService {
  private readonly logger = new Logger(AttendanceStatsService.name);

  constructor(
    @InjectModel(Models.Attendance) private readonly attendances: Model<Attendance>,
    @InjectModel(Models.AttendanceWarning) private readonly warnings: Model<AttendanceWarning>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
  ) {}

  /** absenceRate over every record of each student in the class; key = studentId string. */
  async warningFlags(
    classId: Types.ObjectId,
    studentIds?: Types.ObjectId[],
  ): Promise<Map<string, { absenceRate: number; warning: boolean }>> {
    const { attendanceWarningThreshold } = await this.settings.get();
    const rows = await this.attendances.aggregate<{ _id: { s: Types.ObjectId; st: AttendanceStatus }; n: number }>([
      { $match: { classId, ...(studentIds ? { studentId: { $in: studentIds } } : {}) } },
      { $group: { _id: { s: '$studentId', st: '$status' }, n: { $sum: 1 } } },
    ]);
    const counts = new Map<string, AttendanceCounts>();
    for (const r of rows) {
      const k = r._id.s.toString();
      counts.set(k, { ...(counts.get(k) ?? {}), [r._id.st]: r.n });
    }
    return new Map(
      [...counts].map(([k, c]) => {
        const rate = absenceRate(c);
        return [k, { absenceRate: rate, warning: rate > attendanceWarningThreshold }];
      }),
    );
  }

  @OnEvent(DomainEvent.AttendanceRecorded)
  async onAttendanceRecorded(p: AttendanceRecordedPayload): Promise<void> {
    try {
      await this.evaluate(new Types.ObjectId(p.classId), p.studentIds);
    } catch (e) {
      this.logger.error(`absence warning evaluation failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    }
  }

  async evaluate(classId: Types.ObjectId, studentIds: string[]): Promise<void> {
    const ids = studentIds.map((id) => new Types.ObjectId(id));
    const flags = await this.warningFlags(classId, ids);
    for (const studentId of ids) {
      try {
        await this.evaluateOne(classId, studentId, flags.get(studentId.toString()));
      } catch (e) {
        this.logger.error(
          `absence warning evaluation failed for student ${studentId.toString()}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`,
        );
      }
    }
  }

  private async evaluateOne(
    classId: Types.ObjectId,
    studentId: Types.ObjectId,
    found: { absenceRate: number; warning: boolean } | undefined,
  ): Promise<void> {
    const flag = found ?? { absenceRate: 0, warning: false };
    if (!flag.warning) {
      await this.warnings.deleteOne({ studentId, classId });
      return;
    }
    let created: { _id: Types.ObjectId };
    try {
      created = await this.warnings.create({ studentId, classId, triggeredAt: this.clock.now(), absenceRate: flag.absenceRate });
    } catch (e) {
      if (isDuplicateKey(e)) return; // already warned
      throw e;
    }
    try {
      await this.notifyWarning(studentId, flag.absenceRate);
    } catch (e) {
      // Undo the marker so the next save retries the notification.
      await this.warnings.deleteOne({ _id: created._id });
      throw e;
    }
  }

  private async notifyWarning(studentId: Types.ObjectId, rate: number): Promise<void> {
    const student = await this.students.findById(studentId, { userId: 1, fullName: 1, code: 1 }).lean();
    const staff = await this.users.find({ role: Role.ACADEMIC_STAFF, status: UserStatus.ACTIVE }, { _id: 1 }).lean();
    const recipients = [...(student?.userId ? [student.userId] : []), ...staff.map((u) => u._id)];
    await this.notifications.notify(recipients, {
      type: NotificationType.ATTENDANCE_WARNING,
      title: 'Cảnh báo vắng mặt',
      body: `${student?.fullName ?? 'Học viên'} (${student?.code ?? ''}) vắng ${Math.round(rate * 100)}% số buổi, vượt ngưỡng cảnh báo.`,
      refType: NotificationRefType.STUDENT,
      refId: studentId,
    });
  }
}
