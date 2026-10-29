import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import {
  attendanceRate,
  AttendanceStatus,
  AuditAction,
  AuditLogDto,
  EnrollmentStatus,
  ErrorCode,
  ListStudentsQuery,
  removeVietnameseTones,
  fromDateOnly,
  Role,
  StudentAuditQuery,
  StudentBriefDto,
  StudentDetailDto,
  StudentDto,
  StudentTeacherViewDto,
  toDateOnly,
  UpdateStudentContactInput,
  UpdateStudentInput,
  UpdateStudentResultDto,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { ScopeService } from '../../common/scope/scope.service';
import { Models } from '../../database/models';
import { AuditLog } from '../../database/schemas/audit-log.schema';
import { Attendance } from '../../database/schemas/attendance.schema';
import { Enrollment } from '../../database/schemas/enrollment.schema';
import { Student } from '../../database/schemas/student.schema';
import { User } from '../../database/schemas/user.schema';
import { DuplicatesService } from './duplicates.service';
import {
  EnrollmentLean,
  StudentLean,
  toEnrollmentDto,
  toStudentBriefDto,
  toStudentDto,
} from './admissions.mapper';
import { escapeRegex } from '../../common/util/escape-regex';

const SORTS = new Set(['createdAt', '-createdAt', 'fullName', '-fullName', 'code', '-code']);

/** "+84 912.345-678" -> "0912345678"; leaves anything else untouched (still regex-escaped by callers). */
function normalizePhoneQuery(q: string): string {
  const compact = q.replace(/[\s.-]/g, '');
  return compact.startsWith('+84') ? `0${compact.slice(3)}` : compact;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Attendance) private readonly attendances: Model<Attendance>,
    @InjectModel(Models.AuditLog) private readonly auditLogs: Model<AuditLog>,
    @InjectModel(Models.User) private readonly users: Model<User>,
    @InjectConnection() private readonly conn: Connection,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly duplicates: DuplicatesService,
  ) {}

  /** Student ids having an enrollment that matches classId/courseId, or null when neither is given. */
  private async idsByEnrollment(user: AuthUser, q: ListStudentsQuery): Promise<Types.ObjectId[] | null> {
    if (!q.classId && !q.courseId) return null;
    const filter: FilterQuery<Enrollment> = {};
    if (user.role === Role.TEACHER) {
      // Never look outside the teacher's own classes (would reveal enrollments elsewhere).
      const own = await this.scope.teacherClassIds(user.id);
      filter.classId = { $in: own };
      filter.status = { $in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] };
      if (q.classId && !own.some((c) => c.equals(q.classId))) return [];
    } else {
      // R17: CANCELLED enrollments do not count for the class/course filters.
      filter.status = { $ne: EnrollmentStatus.CANCELLED };
    }
    if (q.classId) filter.classId = new Types.ObjectId(q.classId);
    if (q.courseId) filter.courseId = new Types.ObjectId(q.courseId);
    return this.enrollments.distinct('studentId', filter);
  }

  async list(user: AuthUser, q: ListStudentsQuery) {
    const and: FilterQuery<Student>[] = [{ deletedAt: null }];
    if (user.role === Role.TEACHER) and.push({ _id: { $in: await this.scope.teacherStudentIds(user.id) } });
    const byEnrollment = await this.idsByEnrollment(user, q);
    if (byEnrollment) and.push({ _id: { $in: byEnrollment } });
    if (q.status) and.push({ status: q.status });
    if (q.q) {
      const name = removeVietnameseTones(q.q).trim();
      const phone = normalizePhoneQuery(q.q);
      and.push({
        $or: [
          ...(name ? [{ fullNameSearch: { $regex: escapeRegex(name) } }] : []),
          { code: { $regex: `^${escapeRegex(q.q.toUpperCase())}` } },
          // Teachers must not be able to probe emails they cannot see.
          ...(user.role === Role.TEACHER ? [] : [{ email: { $regex: `^${escapeRegex(q.q.toLowerCase())}` } }]),
          ...(phone ? [{ phone: { $regex: `^${escapeRegex(phone)}` } }] : []),
        ],
      });
    }
    const page = await paginate(this.students, { $and: and }, {
      page: q.page,
      limit: q.limit,
      sort: q.sort && SORTS.has(q.sort) ? q.sort : '-createdAt',
    });
    const rows = page.data as unknown as StudentLean[];
    const data: Array<StudentDto | StudentBriefDto> =
      user.role === Role.TEACHER ? rows.map(toStudentBriefDto) : rows.map(toStudentDto);
    return { data, meta: page.meta };
  }

  async get(user: AuthUser, id: string): Promise<StudentDetailDto | StudentTeacherViewDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const studentId = new Types.ObjectId(id);
    let classScope: Types.ObjectId[] | null = null;
    if (user.role === Role.STUDENT) {
      if (!user.studentId || !user.studentId.equals(studentId)) throw new AppError(ErrorCode.NOT_FOUND);
    } else if (user.role === Role.TEACHER) {
      const visible = await this.scope.teacherStudentIds(user.id);
      if (!visible.some((v) => v.equals(studentId))) throw new AppError(ErrorCode.NOT_FOUND);
      classScope = await this.scope.teacherClassIds(user.id);
    }
    const student = await this.students.findOne({ _id: studentId, deletedAt: null }).lean();
    if (!student) throw new AppError(ErrorCode.NOT_FOUND);
    const enrollments = (await this.enrollments
      .find({ studentId, ...(classScope ? { classId: { $in: classScope } } : {}) })
      .sort({ createdAt: 1, _id: 1 })
      .lean()) as unknown as EnrollmentLean[];
    const lean = student as unknown as StudentLean;
    if (classScope) return { ...toStudentBriefDto(lean), enrollments: enrollments.map(toEnrollmentDto) };
    return {
      ...toStudentDto(lean),
      enrollments: enrollments.map(toEnrollmentDto),
      // D7: averageScore / outstandingBalance are wired to real data by the Lead in W3.
      summary: { attendanceRate: await this.attendanceRateOf(studentId), averageScore: null, outstandingBalance: 0 },
    };
  }

  async me(user: AuthUser) {
    if (!user.studentId) throw new AppError(ErrorCode.NOT_FOUND);
    return this.get(user, user.studentId.toString());
  }

  private async attendanceRateOf(studentId: Types.ObjectId): Promise<number | null> {
    const rows = await this.attendances.aggregate<{ _id: AttendanceStatus; n: number }>([
      { $match: { studentId } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    return attendanceRate(Object.fromEntries(rows.map((r) => [r._id, r.n])));
  }

  async update(user: AuthUser, id: string, input: UpdateStudentInput): Promise<UpdateStudentResultDto> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    return this.apply(user, new Types.ObjectId(id), input);
  }

  async updateContact(user: AuthUser, input: UpdateStudentContactInput): Promise<UpdateStudentResultDto> {
    if (!user.studentId) throw new AppError(ErrorCode.NOT_FOUND);
    return this.apply(user, user.studentId, input);
  }

  private async apply(user: AuthUser, studentId: Types.ObjectId, input: UpdateStudentInput): Promise<UpdateStudentResultDto> {
    const current = (await this.students.findOne({ _id: studentId, deletedAt: null }).lean()) as StudentLean | null;
    if (!current) throw new AppError(ErrorCode.NOT_FOUND);

    // Audit values are plain/lean (date-only strings), only for fields that actually change.
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const set: Record<string, unknown> = {};
    const view = (k: keyof UpdateStudentInput, s: StudentLean): unknown => {
      if (k === 'dob') return toDateOnly(s.dob);
      if (k === 'email') return s.email ?? null;
      return s[k] ?? null;
    };
    for (const k of Object.keys(input) as Array<keyof UpdateStudentInput>) {
      const next = input[k] ?? null;
      if (next === view(k, current)) continue;
      before[k] = view(k, current);
      after[k] = next;
      set[k] = k === 'dob' ? fromDateOnly(input.dob as string) : next;
    }
    if (Object.keys(set).length === 0) return { student: toStudentDto(current) };
    // The schema's validate hook does not run on findOneAndUpdate: keep fullNameSearch in sync here.
    if (typeof set.fullName === 'string') set.fullNameSearch = removeVietnameseTones(set.fullName).toLowerCase().trim();

    const updated = await withTransaction(this.conn, async (s) => {
      const doc = (await this.students
        .findOneAndUpdate({ _id: studentId, deletedAt: null }, { $set: set }, { new: true, runValidators: true, session: s })
        .lean()) as StudentLean | null;
      if (!doc) throw new AppError(ErrorCode.NOT_FOUND);
      // The STUDENT account shows the same name (header, /auth/me).
      if (typeof set.fullName === 'string' && doc.userId) {
        await this.users.updateOne({ _id: doc.userId }, { $set: { fullName: set.fullName } }, { session: s });
      }
      await this.audit.log({ actor: user, action: AuditAction.UPDATE, entity: 'student', entityId: studentId, before, after }, s);
      return doc;
    });

    const result: UpdateStudentResultDto = { student: toStudentDto(updated) };
    if ('phone' in set || 'email' in set) {
      const dups = await this.duplicates.find({ phone: updated.phone, email: updated.email }, { studentId });
      if (dups.length > 0) result.warnings = { duplicates: dups };
    }
    return result;
  }

  async auditTrail(id: string, q: StudentAuditQuery) {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const studentId = new Types.ObjectId(id);
    if (!(await this.students.exists({ _id: studentId, deletedAt: null }))) throw new AppError(ErrorCode.NOT_FOUND);
    const page = await paginate(this.auditLogs, { entity: 'student', entityId: studentId }, { page: q.page, limit: q.limit, sort: '-at' });
    const data: AuditLogDto[] = (page.data as unknown as Array<AuditLog & { _id: Types.ObjectId }>).map((l) => ({
      id: l._id.toString(),
      actorId: l.actorId.toString(),
      actorRole: l.actorRole,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId.toString(),
      before: l.before ?? null,
      after: l.after ?? null,
      at: l.at.toISOString(),
    }));
    return { data, meta: page.meta };
  }
}
