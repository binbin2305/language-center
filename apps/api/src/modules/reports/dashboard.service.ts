import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  addVnDays,
  ClassStatus,
  EnrollmentStatus,
  SessionStatus,
  startOfVnDay,
  vnDay,
  type DashboardDto,
} from '@lc/shared';
import { ClockService } from '../../common/clock/clock.service';
import { Models } from '../../database/models';
import type { Class } from '../../database/schemas/class.schema';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { Invoice } from '../../database/schemas/invoice.schema';
import type { Lead } from '../../database/schemas/lead.schema';
import type { Room } from '../../database/schemas/room.schema';
import type { Session } from '../../database/schemas/session.schema';
import type { Student } from '../../database/schemas/student.schema';
import type { User } from '../../database/schemas/user.schema';
import { overdueFilter } from '../fees/fees.mapper';

const TREND_MONTHS = 6;

/** FR-RPT-06. Read-only aggregation over several collections (ARCHITECTURE §4.3 exception). */
@Injectable()
export class DashboardService {
  constructor(
    private readonly clock: ClockService,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Session) private readonly sessions: Model<Session>,
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    @InjectModel(Models.Lead) private readonly leads: Model<Lead>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectModel(Models.Room) private readonly rooms: Model<Room>,
  ) {}

  async get(): Promise<DashboardDto> {
    const now = this.clock.now();
    const today = vnDay(now);
    const dayStart = startOfVnDay(today);
    const dayEnd = startOfVnDay(addVnDays(today, 1));

    const [activeIds, ongoingClasses, todayDocs, overdueInvoices, waitingEnrollments, admissionsTrend] = await Promise.all([
      this.enrollments.distinct('studentId', { status: EnrollmentStatus.ENROLLED }),
      this.classes.countDocuments({ status: { $in: [ClassStatus.PLANNED, ClassStatus.ONGOING] } }),
      this.sessions
        .find({ status: SessionStatus.SCHEDULED, startAt: { $gte: dayStart, $lt: dayEnd } })
        .sort({ startAt: 1 })
        .lean(),
      this.invoices.countDocuments(overdueFilter(now)),
      this.enrollments.countDocuments({ status: EnrollmentStatus.WAITING_CLASS }),
      this.trend(today),
    ]);

    const [cls, rooms, teachers] = await Promise.all([
      this.classes.find({ _id: { $in: todayDocs.map((s) => s.classId) } }, { code: 1 }).lean(),
      this.rooms.find({ _id: { $in: todayDocs.map((s) => s.roomId) } }, { code: 1 }).lean(),
      this.users.find({ _id: { $in: todayDocs.map((s) => s.teacherId) } }, { fullName: 1 }).lean(),
    ]);
    const code = new Map(cls.map((c) => [c._id.toString(), c.code]));
    const roomCode = new Map(rooms.map((r) => [r._id.toString(), r.code]));
    const teacherName = new Map(teachers.map((u) => [u._id.toString(), u.fullName]));

    return {
      activeStudents: activeIds.length,
      ongoingClasses,
      sessionsToday: todayDocs.length,
      overdueInvoices,
      waitingEnrollments,
      todaySessions: todayDocs.map((s) => ({
        sessionId: s._id.toString(),
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        classId: s.classId.toString(),
        classCode: code.get(s.classId.toString()) ?? '',
        roomCode: roomCode.get(s.roomId.toString()) ?? null,
        teacherName: teacherName.get(s.teacherId.toString()) ?? null,
        attendanceTaken: s.attendanceTakenAt != null,
      })),
      admissionsTrend,
    };
  }

  /** Last 6 VN months up to and including the current one, oldest first. */
  private async trend(today: string): Promise<DashboardDto['admissionsTrend']> {
    const [y, m] = today.split('-').map(Number);
    const months: string[] = [];
    for (let i = TREND_MONTHS - 1; i >= 0; i--) {
      const idx = y * 12 + (m - 1) - i;
      months.push(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`);
    }
    const since = startOfVnDay(`${months[0]}-01`);
    const perMonth = async (model: Model<Lead> | Model<Student>, extra: Record<string, unknown>) => {
      const rows = await model.aggregate<{ _id: string; n: number }>([
        { $match: { createdAt: { $gte: since }, ...extra } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+07:00' } }, n: { $sum: 1 } } },
      ]);
      return new Map(rows.map((r) => [r._id, r.n]));
    };
    const [leads, profiles] = await Promise.all([perMonth(this.leads, { deletedAt: null }), perMonth(this.students, { deletedAt: null })]);
    return months.map((month) => ({ month, leads: leads.get(month) ?? 0, profiles: profiles.get(month) ?? 0 }));
  }
}
