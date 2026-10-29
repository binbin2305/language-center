import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import {
  attendanceRate,
  AttendanceStatus,
  EnrollmentStatus,
  ErrorCode,
  ListStudentsQuery,
  removeVietnameseTones,
  Role,
  StudentBriefDto,
  StudentDetailDto,
  StudentDto,
  StudentTeacherViewDto,
} from '@lc/shared';
import { AuthUser } from '../../common/auth/auth-user';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { ScopeService } from '../../common/scope/scope.service';
import { Models } from '../../database/models';
import { Attendance } from '../../database/schemas/attendance.schema';
import { Enrollment } from '../../database/schemas/enrollment.schema';
import { Student } from '../../database/schemas/student.schema';
import {
  EnrollmentLean,
  StudentLean,
  toEnrollmentDto,
  toStudentBriefDto,
  toStudentDto,
} from './admissions.mapper';

const SORTS = new Set(['createdAt', '-createdAt', 'fullName', '-fullName', 'code', '-code']);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    private readonly scope: ScopeService,
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
          ...(name ? [{ fullNameSearch: { $regex: escapeRe(name) } }] : []),
          { code: { $regex: `^${escapeRe(q.q.toUpperCase())}` } },
          // Teachers must not be able to probe emails they cannot see.
          ...(user.role === Role.TEACHER ? [] : [{ email: { $regex: `^${escapeRe(q.q.toLowerCase())}` } }]),
          ...(phone ? [{ phone: { $regex: `^${escapeRe(phone)}` } }] : []),
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
}
