import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  absenceRate,
  addVnDays,
  attendanceRate,
  AttendanceStatus,
  AuditAction,
  DomainEvent,
  ErrorCode,
  Role,
  SessionStatus,
  startOfVnDay,
  type AttendanceDto,
  type AttendanceSummaryQuery,
  type AttendanceSummaryRowDto,
  type ListAttendanceQuery,
  type Paginated,
  type AttendanceCounts,
  type SessionAttendanceDto,
  type TakeAttendanceInput,
  type UpdateAttendanceInput,
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
import type { Class } from '../../database/schemas/class.schema';
import { RosterRow, toAttendanceDto, toSessionAttendanceDto } from './attendance.mapper';
import { enrolledAt } from './roster';

const EARLY_MS = 15 * 60_000;
const DAY_MS = 24 * 3_600_000;

type SessionRec = Session & { _id: Types.ObjectId };
type AttendanceRec = Attendance & { _id: Types.ObjectId };

const notFound = () => new AppError(ErrorCode.NOT_FOUND);

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Session) private readonly sessions: Model<Session>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Attendance) private readonly attendances: Model<Attendance>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
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

    const seen = new Set<string>();
    const dup = input.records.some((r) => seen.size === seen.add(r.studentId).size);
    if (dup) throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { records: 'DUPLICATE_STUDENT' } });
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
      return [...new Set(roster.map((e) => e.studentId.toString()))];
    });

    try {
      await this.events.emitAsync(DomainEvent.AttendanceRecorded, {
        sessionId: session._id.toString(),
        classId: session.classId.toString(),
        studentIds,
      });
    } catch (e) {
      // Already committed; a failing listener must not fail the request.
      this.logger.error(`attendance.recorded listener failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    }
    const fresh = (await this.sessions.findById(session._id).lean<SessionRec>())!;
    return this.build(fresh, user);
  }

  async update(id: string, input: UpdateAttendanceInput, user: AuthUser): Promise<SessionAttendanceDto> {
    const session = await this.loadScoped(id, user);
    if (session.status === SessionStatus.CANCELLED) throw new AppError(ErrorCode.SESSION_CANCELLED);
    if (!session.attendanceTakenAt) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
    if (!(await this.canEdit(session, user))) throw new AppError(ErrorCode.ATTENDANCE_EDIT_WINDOW_CLOSED);
    const seen = new Set<string>();
    const dup = input.records.some((r) => seen.size === seen.add(r.studentId).size);
    if (dup) throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { records: 'DUPLICATE_STUDENT' } });

    const now = this.clock.now();
    const changed = await withTransaction(this.conn, async (s) => {
      // Lock-key protocol: bump before reading the roster invariant.
      await this.counters.next(`lock:class:${session.classId.toString()}`, s);
      const roster = await this.roster(session, s);
      const enrollmentByStudent = new Map(roster.map((e) => [e.studentId.toString(), e._id]));
      const existing = await this.attendances.find({ sessionId: session._id }).session(s).lean<AttendanceRec[]>();
      const recByStudent = new Map(existing.map((r) => [r.studentId.toString(), r]));
      const unknown = input.records.map((r) => r.studentId).filter((sid) => !enrollmentByStudent.has(sid) && !recByStudent.has(sid));
      if (unknown.length > 0) throw new AppError(ErrorCode.STUDENT_NOT_IN_ROSTER, undefined, { studentIds: unknown });

      const ids: string[] = [];
      for (const r of input.records) {
        const cur = recByStudent.get(r.studentId);
        if (cur && cur.status === r.status) continue;
        const entry = { from: cur?.status ?? null, to: r.status, by: user.id, at: now, ...(r.reason !== undefined ? { reason: r.reason } : {}) };
        const studentId = new Types.ObjectId(r.studentId);
        if (cur) {
          // recordedBy stays the original taker; the editor is in history.by.
          await this.attendances.updateOne({ _id: cur._id }, { $set: { status: r.status }, $push: { history: entry } }, { session: s });
        } else {
          await this.attendances.updateOne(
            { sessionId: session._id, studentId },
            {
              $setOnInsert: {
                sessionId: session._id,
                classId: session.classId,
                studentId,
                enrollmentId: enrollmentByStudent.get(r.studentId),
                status: r.status,
                recordedBy: user.id,
                history: [entry],
              },
            },
            { upsert: true, session: s },
          );
        }
        await this.audit.log(
          {
            actor: user,
            action: AuditAction.UPDATE,
            entity: 'attendance',
            entityId: cur?._id ?? session._id,
            before: { sessionId: session._id, studentId, status: cur?.status ?? null },
            after: { sessionId: session._id, studentId, status: r.status },
          },
          s,
        );
        ids.push(r.studentId);
      }
      return ids;
    });

    if (changed.length > 0) await this.emitRecorded(session, changed);
    const fresh = (await this.sessions.findById(session._id).lean<SessionRec>())!;
    return this.build(fresh, user);
  }

  private async emitRecorded(session: SessionRec, studentIds: string[]): Promise<void> {
    try {
      await this.events.emitAsync(DomainEvent.AttendanceRecorded, {
        sessionId: session._id.toString(),
        classId: session.classId.toString(),
        studentIds,
      });
    } catch (e) {
      // Already committed; a failing listener must not fail the request.
      this.logger.error(`attendance.recorded listener failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    }
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
    const editable = user.role === Role.MANAGER || session.status === SessionStatus.CANCELLED ? false : !taken || mayEdit;
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

  /**
   * FR-ATT-04 data scope (ARCHITECTURE 4.6): student = own records in history classes, teacher = own classes
   * (substitute excluded), M/S unrestricted. Returns null when the scope is provably empty.
   */
  private async historyMatch(
    q: { from?: string; to?: string; classId?: string; studentId?: string },
    user: AuthUser,
  ): Promise<Record<string, unknown> | null> {
    const match: Record<string, unknown> = {};
    let classIds: Types.ObjectId[] | null = null;
    let studentId = q.studentId;
    if (user.role === Role.STUDENT) {
      if (!user.studentId) return null;
      studentId = user.studentId.toString();
      classIds = await this.scope.studentClassIds(user.studentId, 'history');
    } else if (user.role === Role.TEACHER) {
      classIds = await this.scope.teacherClassIds(user.id);
    }
    if (q.classId) {
      if (!Types.ObjectId.isValid(q.classId)) return null;
      const want = new Types.ObjectId(q.classId);
      if (classIds && !classIds.some((id) => id.equals(want))) return null;
      classIds = [want];
    }
    if (classIds) {
      if (classIds.length === 0) return null;
      match.classId = { $in: classIds };
    }
    if (studentId) match.studentId = new Types.ObjectId(studentId);
    return match;
  }

  /** Attendance joined with its session; cancelled sessions and out-of-range VN days are dropped. */
  private joinSession(match: Record<string, unknown>, q: { from?: string; to?: string }) {
    const startAt: Record<string, Date> = {};
    if (q.from) startAt.$gte = startOfVnDay(q.from);
    if (q.to) startAt.$lt = startOfVnDay(addVnDays(q.to, 1));
    return [
      { $match: match },
      { $lookup: { from: this.sessions.collection.name, localField: 'sessionId', foreignField: '_id', as: 'session' } },
      { $unwind: '$session' },
      {
        $match: {
          'session.status': { $ne: SessionStatus.CANCELLED },
          ...(Object.keys(startAt).length ? { 'session.startAt': startAt } : {}),
        },
      },
    ];
  }

  async list(q: ListAttendanceQuery, user: AuthUser): Promise<Paginated<AttendanceDto>> {
    const empty = { data: [], meta: { page: q.page, limit: q.limit, total: 0 } };
    const match = await this.historyMatch(q, user);
    if (!match) return empty;
    const [res] = await this.attendances.aggregate<{
      rows: (Attendance & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date; session: Session })[];
      count: { n: number }[];
    }>([
      ...this.joinSession(match, q),
      {
        $facet: {
          rows: [
            { $sort: { 'session.startAt': -1, _id: -1 } },
            { $skip: (q.page - 1) * q.limit },
            { $limit: q.limit },
          ],
          count: [{ $count: 'n' }],
        },
      },
    ]);
    const rows = res?.rows ?? [];
    const [studentDocs, classDocs] = await Promise.all([
      this.students.find({ _id: { $in: rows.map((r) => r.studentId) } }, { fullName: 1 }).lean(),
      this.classes.find({ _id: { $in: rows.map((r) => r.classId) } }, { code: 1 }).lean(),
    ]);
    const names = new Map(studentDocs.map((x) => [String(x._id), x.fullName]));
    const codes = new Map(classDocs.map((x) => [String(x._id), x.code]));
    return {
      data: rows.map((r) => toAttendanceDto(r, r.session.startAt, names.get(String(r.studentId)), codes.get(String(r.classId)))),
      meta: { page: q.page, limit: q.limit, total: res?.count[0]?.n ?? 0 },
    };
  }

  async summary(q: AttendanceSummaryQuery, user: AuthUser): Promise<{ data: AttendanceSummaryRowDto[] }> {
    const match = await this.historyMatch(q, user);
    if (!match) return { data: [] };
    const field = q.groupBy === 'student' ? 'studentId' : 'classId';
    const groups = await this.attendances.aggregate<{ _id: Types.ObjectId; counts: { s: AttendanceStatus; n: number }[] }>([
      ...this.joinSession(match, q),
      { $group: { _id: { k: `$${field}`, s: '$status' }, n: { $sum: 1 } } },
      { $group: { _id: '$_id.k', counts: { $push: { s: '$_id.s', n: '$n' } } } },
    ]);
    const ids = groups.map((g) => g._id);
    const labels = new Map<string, string>();
    if (q.groupBy === 'student') {
      for (const x of await this.students.find({ _id: { $in: ids } }, { fullName: 1 }).lean()) labels.set(String(x._id), x.fullName);
    } else {
      for (const x of await this.classes.find({ _id: { $in: ids } }, { code: 1 }).lean()) labels.set(String(x._id), x.code);
    }
    const round = (x: number) => Math.round(x * 1e4) / 1e4;
    const data = groups.map((g): AttendanceSummaryRowDto => {
      const c: Record<AttendanceStatus, number> = { PRESENT: 0, LATE: 0, EXCUSED: 0, UNEXCUSED: 0 };
      for (const e of g.counts) c[e.s] = e.n;
      return {
        key: g._id.toString(),
        label: labels.get(String(g._id)) ?? '',
        ...c,
        total: c.PRESENT + c.LATE + c.EXCUSED + c.UNEXCUSED,
        // The shared helper returns null for zero records (never happens for a grouped row); 0 satisfies the DTO.
        attendanceRate: round(attendanceRate(c) ?? 0),
        absenceRate: round(absenceRate(c)),
      };
    });
    return { data: data.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key)) };
  }
}

