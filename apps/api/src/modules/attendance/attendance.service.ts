import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  absenceRate,
  AttendanceStatus,
  AuditAction,
  DomainEvent,
  ErrorCode,
  Role,
  SessionStatus,
  type AttendanceCounts,
  type SessionAttendanceDto,
  type TakeAttendanceInput,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { ScopeService } from '../../common/scope/scope.service';
import { SettingsService } from '../../common/settings/settings.service';
import { Models } from '../../database/models';
import type { Attendance } from '../../database/schemas/attendance.schema';
import type { Enrollment, EnrollmentDoc } from '../../database/schemas/enrollment.schema';
import type { Session } from '../../database/schemas/session.schema';
import type { Student } from '../../database/schemas/student.schema';
import type { User } from '../../database/schemas/user.schema';
import { RosterRow, toSessionAttendanceDto } from './attendance.mapper';
import { enrolledAt } from './roster';

const EARLY_MS = 15 * 60_000;
const DAY_MS = 24 * 3_600_000;

type SessionRec = Session & { _id: Types.ObjectId };
type AttendanceRec = Attendance & { _id: Types.ObjectId };

const notFound = () => new AppError(ErrorCode.NOT_FOUND);

@Injectable()
export class AttendanceService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Session) private readonly sessions: Model<Session>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Attendance) private readonly attendances: Model<Attendance>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
    private readonly clock: ClockService,
    private readonly scope: ScopeService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
  ) {}

  /** D13: enrollments of the session's class that were ENROLLED at session.startAt. */
  async roster(session: Pick<SessionRec, 'classId' | 'startAt'>, s?: ClientSession): Promise<EnrollmentDoc[]> {
    const all = await this.enrollments.find({ classId: session.classId }).session(s ?? null);
    return all.filter((e) => enrolledAt(e.history, session.startAt));
  }

  /** 404 for missing sessions and for teachers outside the session's scope. */
  private async loadScoped(id: string, user: AuthUser): Promise<SessionRec> {
    if (!Types.ObjectId.isValid(id)) throw notFound();
    const session = await this.sessions.findById(id).lean<SessionRec>();
    if (!session) throw notFound();
    if (user.role === Role.TEACHER && !(await this.scope.teacherCanTakeAttendance(user.id, session))) throw notFound();
    return session;
  }

  /** D16: teacher edit window; staff unlimited; manager read-only. */
  async canEdit(session: Pick<SessionRec, 'endAt'>, user: AuthUser): Promise<boolean> {
    if (user.role === Role.ACADEMIC_STAFF) return true;
    if (user.role !== Role.TEACHER) return false;
    const days = (await this.settings.get()).teacherAttendanceEditDays;
    return this.clock.now().getTime() < session.endAt.getTime() + days * DAY_MS;
  }

  async getSessionAttendance(id: string, user: AuthUser): Promise<SessionAttendanceDto> {
    const session = await this.loadScoped(id, user);
    return this.build(session, user);
  }

  async take(id: string, input: TakeAttendanceInput, user: AuthUser): Promise<SessionAttendanceDto> {
    const session = await this.loadScoped(id, user);
    if (session.status === SessionStatus.CANCELLED) throw new AppError(ErrorCode.SESSION_CANCELLED);
    if (session.attendanceTakenAt) throw new AppError(ErrorCode.ATTENDANCE_ALREADY_TAKEN);
    const now = this.clock.now();
    if (now.getTime() < session.startAt.getTime() - EARLY_MS) throw new AppError(ErrorCode.ATTENDANCE_TOO_EARLY);

    const byStudent = new Map(input.records.map((r) => [r.studentId, r]));
    const studentIds = await withTransaction(this.conn, async (s) => {
      // Lock-key protocol: bump before reading the roster invariant.
      await this.counters.next(`lock:class:${session.classId.toString()}`, s);
      const roster = await this.roster(session, s);
      const rosterIds = new Set(roster.map((e) => e.studentId.toString()));
      const unknown = [...byStudent.keys()].filter((sid) => !rosterIds.has(sid));
      if (unknown.length > 0) throw new AppError(ErrorCode.STUDENT_NOT_IN_ROSTER, undefined, { studentIds: unknown });
      const missing = [...rosterIds].filter((sid) => !byStudent.has(sid));
      if (missing.length > 0) throw new AppError(ErrorCode.ATTENDANCE_INCOMPLETE, 400, { studentIds: missing });

      const claimed = await this.sessions.findOneAndUpdate(
        { _id: session._id, attendanceTakenAt: null, status: SessionStatus.SCHEDULED },
        { $set: { attendanceTakenAt: now, ...(input.sessionNote !== undefined ? { attendanceNote: input.sessionNote } : {}) } },
        { new: true, session: s },
      );
      if (!claimed) throw new AppError(ErrorCode.ATTENDANCE_ALREADY_TAKEN);

      await this.attendances.bulkWrite(
        roster.map((e) => {
          const r = byStudent.get(e.studentId.toString())!;
          return {
            updateOne: {
              filter: { sessionId: session._id, studentId: e.studentId },
              update: {
                $setOnInsert: {
                  sessionId: session._id,
                  classId: session.classId,
                  studentId: e.studentId,
                  enrollmentId: e._id,
                  status: r.status,
                  ...(r.note !== undefined ? { note: r.note } : {}),
                  recordedBy: user.id,
                  history: [],
                },
              },
              upsert: true,
            },
          };
        }),
        { session: s },
      );
      await this.audit.log(
        {
          actor: user,
          action: AuditAction.CREATE,
          entity: 'Attendance',
          entityId: session._id,
          after: { sessionId: session._id, records: input.records.length },
        },
        s,
      );
      return roster.map((e) => e.studentId.toString());
    });

    try {
      await this.events.emitAsync(DomainEvent.AttendanceRecorded, {
        sessionId: session._id.toString(),
        classId: session.classId.toString(),
        studentIds,
      });
    } catch {
      // Already committed; a failing listener must not fail the request.
    }
    const fresh = (await this.sessions.findById(session._id).lean<SessionRec>())!;
    return this.build(fresh, user);
  }

  private async build(session: SessionRec, user: AuthUser): Promise<SessionAttendanceDto> {
    const records = await this.attendances.find({ sessionId: session._id }).lean<AttendanceRec[]>();
    const recByStudent = new Map(records.map((r) => [r.studentId.toString(), r]));
    const roster = await this.roster(session);
    const entries = new Map<string, { studentId: Types.ObjectId; enrollmentId: Types.ObjectId }>();
    for (const e of roster) entries.set(e.studentId.toString(), { studentId: e.studentId, enrollmentId: e._id });
    // Students with a record but no longer on the roster stay visible.
    for (const r of records) {
      if (!entries.has(r.studentId.toString())) entries.set(r.studentId.toString(), { studentId: r.studentId, enrollmentId: r.enrollmentId });
    }
    const ids = [...entries.values()].map((e) => e.studentId);
    const studs = await this.students.find({ _id: { $in: ids } }, { code: 1, fullName: 1 }).lean();
    const byId = new Map(studs.map((x) => [x._id.toString(), x]));
    const rates = await this.rates(session.classId, ids);

    const rows: RosterRow[] = [...entries.values()]
      .map((e) => {
        const st = byId.get(e.studentId.toString());
        return {
          studentId: e.studentId,
          enrollmentId: e.enrollmentId,
          studentCode: st?.code ?? '',
          fullName: st?.fullName ?? '',
          record: recByStudent.get(e.studentId.toString()),
          absenceRate: rates.get(e.studentId.toString()) ?? 0,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi') || a.studentCode.localeCompare(b.studentCode));

    const taken = session.attendanceTakenAt ?? null;
    let takenByName: string | null = null;
    if (taken) {
      const by = records.find((r) => r.recordedBy)?.recordedBy;
      if (by) takenByName = (await this.users.findById(by, { fullName: 1 }).lean())?.fullName ?? null;
    }
    const mayEdit = await this.canEdit(session, user);
    const editable = user.role === Role.MANAGER ? false : !taken || mayEdit;
    return toSessionAttendanceDto({
      sessionId: session._id,
      takenAt: taken,
      takenByName,
      editable,
      ...(session.attendanceNote !== undefined ? { sessionNote: session.attendanceNote } : {}),
      rows,
    });
  }

  /** absenceRate over each student's records in the class (R2; AT-04 replaces with warningFlags). */
  private async rates(classId: Types.ObjectId, studentIds: Types.ObjectId[]): Promise<Map<string, number>> {
    const rows = await this.attendances.aggregate<{ _id: { s: Types.ObjectId; st: AttendanceStatus }; n: number }>([
      { $match: { classId, studentId: { $in: studentIds } } },
      { $group: { _id: { s: '$studentId', st: '$status' }, n: { $sum: 1 } } },
    ]);
    const counts = new Map<string, AttendanceCounts>();
    for (const r of rows) {
      const k = r._id.s.toString();
      counts.set(k, { ...(counts.get(k) ?? {}), [r._id.st]: r.n });
    }
    return new Map([...counts].map(([k, c]) => [k, absenceRate(c)]));
  }
}

