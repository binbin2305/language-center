import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ErrorCode, Role, classify, isPass, weightedAverage, type ListResultsQuery, type Paginated, type ResultDto, type TranscriptQuery } from '@lc/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { OUTSTANDING_CHECKER, type OutstandingChecker } from '../../common/contracts';
import { AppError } from '../../common/errors/app-error';
import { PdfService } from '../../common/pdf/pdf.service';
import { ScopeService } from '../../common/scope/scope.service';
import { SettingsService } from '../../common/settings/settings.service';
import { Models } from '../../database/models';
import type { Assessment } from '../../database/schemas/assessment.schema';
import type { Class } from '../../database/schemas/class.schema';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { Grade } from '../../database/schemas/grade.schema';
import type { Student } from '../../database/schemas/student.schema';
import { buildTranscript } from './transcript';

interface Pair {
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  courseId: Types.ObjectId;
}

@Injectable()
export class ResultsService {
  constructor(
    @InjectModel(Models.Assessment) private readonly assessments: Model<Assessment>,
    @InjectModel(Models.Grade) private readonly grades: Model<Grade>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @Inject(OUTSTANDING_CHECKER) private readonly outstanding: OutstandingChecker,
    private readonly scope: ScopeService,
    private readonly settings: SettingsService,
    private readonly pdf: PdfService,
  ) {}

  /** FR-GRD-07: only students are blocked, and only when the setting is on. */
  private async assertFeesGate(user: AuthUser): Promise<void> {
    if (user.role !== Role.STUDENT || !user.studentId) return;
    if (!(await this.settings.get()).resultViewRequiresPaidFees) return;
    if (await this.outstanding.hasOverdueBalance(user.studentId)) throw new AppError(ErrorCode.FEES_OUTSTANDING);
  }

  /** Builds one ResultDto per (student, class) pair from confirmed, non-draft grades only. */
  private async buildResults(pairs: Pair[]): Promise<ResultDto[]> {
    if (!pairs.length) return [];
    const classIds = [...new Set(pairs.map((p) => String(p.classId)))].map((x) => new Types.ObjectId(x));
    const assessments = await this.assessments
      .find({ classId: { $in: classIds }, confirmedAt: { $ne: null } })
      .sort({ heldOn: 1, _id: 1 })
      .lean();
    const grades = await this.grades
      .find({ assessmentId: { $in: assessments.map((a) => a._id) }, studentId: { $in: pairs.map((p) => p.studentId) }, isDraft: false })
      .lean();
    const gradeOf = new Map(grades.map((g) => [`${g.assessmentId}:${g.studentId}`, g]));
    const students = await this.students.find({ _id: { $in: pairs.map((p) => p.studentId) } }, { fullName: 1 }).lean();
    const name = new Map(students.map((s) => [String(s._id), s.fullName]));
    const classDocs = await this.classes.find({ _id: { $in: classIds } }, { code: 1, name: 1 }).lean();
    const classOf = new Map(classDocs.map((c) => [String(c._id), c]));

    return pairs.map((p) => {
      const items = assessments
        .filter((a) => a.classId.equals(p.classId))
        .flatMap((a) => {
          const g = gradeOf.get(`${a._id}:${p.studentId}`);
          return g && g.score !== null && g.score !== undefined
            ? [{ assessmentId: a._id.toString(), name: a.name, type: a.type, weight: a.weight, score: g.score }]
            : [];
        });
      const average = weightedAverage(items);
      return {
        studentId: p.studentId.toString(),
        studentName: name.get(String(p.studentId)),
        classId: p.classId.toString(),
        classCode: classOf.get(String(p.classId))?.code,
        className: classOf.get(String(p.classId))?.name,
        courseId: p.courseId.toString(),
        items,
        average,
        gradeClass: average === null ? null : classify(average),
        passed: average === null ? null : isPass(average),
      };
    });
  }

  /** FR-GRD-05 FR-GRD-06: one row per (student, class), scoped by role. */
  async list(q: ListResultsQuery, user: AuthUser): Promise<Paginated<ResultDto>> {
    await this.assertFeesGate(user);
    const match: Record<string, unknown> = {};
    if (q.courseId) match.courseId = new Types.ObjectId(q.courseId);
    if (q.studentId) match.studentId = new Types.ObjectId(q.studentId);
    const empty = { data: [], meta: { page: q.page, limit: q.limit, total: 0 } };

    if (user.role === Role.STUDENT) {
      if (!user.studentId) return empty;
      match.studentId = user.studentId; // overrides any query studentId
    }
    // R22: an enrollment counts for every class it was seated in (classId ∪ classHistory).
    const classMatch: Record<string, unknown> = { cid: { $ne: null } };
    let classFilter: Types.ObjectId[] | null = null;
    if (user.role === Role.TEACHER) classFilter = await this.scope.teacherClassIds(user.id);
    else if (user.role === Role.STUDENT) classFilter = await this.scope.studentClassIds(user.studentId!, 'history');
    if (q.classId) {
      const wanted = new Types.ObjectId(q.classId);
      if (classFilter && !classFilter.some((c) => c.equals(wanted))) return empty;
      classMatch.cid = wanted;
    } else if (classFilter) {
      classMatch.cid = { $in: classFilter };
    }

    // NFR-02: a known class list is matched first through classId_1_status_1 / classHistory_1;
    // the exact per-class $match after $unwind still applies.
    const known = q.classId ? [classMatch.cid as Types.ObjectId] : classFilter;
    if (known) match.$or = [{ classId: { $in: known } }, { classHistory: { $in: known } }];

    const [agg] = await this.enrollments.aggregate<{ rows: Pair[]; total: { n: number }[] }>([
      { $match: match },
      {
        $project: {
          studentId: 1,
          courseId: 1,
          cids: { $setUnion: [{ $cond: [{ $eq: [{ $ifNull: ['$classId', null] }, null] }, [], ['$classId']] }, { $ifNull: ['$classHistory', []] }] },
        },
      },
      { $unwind: '$cids' },
      { $project: { studentId: 1, courseId: 1, cid: '$cids' } },
      { $match: classMatch },
      { $group: { _id: { studentId: '$studentId', classId: '$cid' }, courseId: { $first: '$courseId' }, first: { $min: '$_id' } } },
      { $sort: { first: 1 } },
      {
        $facet: {
          rows: [
            { $skip: (q.page - 1) * q.limit },
            { $limit: q.limit },
            { $project: { _id: 0, studentId: '$_id.studentId', classId: '$_id.classId', courseId: 1 } },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    return {
      data: await this.buildResults(agg?.rows ?? []),
      meta: { page: q.page, limit: q.limit, total: agg?.total[0]?.n ?? 0 },
    };
  }

  /** FR-GRD-08: transcript PDF for one (student, class). */
  async transcript(q: TranscriptQuery, user: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
    if (user.role === Role.STUDENT && !(user.studentId && user.studentId.equals(q.studentId))) {
      throw new AppError(ErrorCode.NOT_FOUND);
    }
    await this.assertFeesGate(user);
    const enrollment = await this.enrollments
      .findOne({ studentId: q.studentId, $or: [{ classId: q.classId }, { classHistory: q.classId }] }, { courseId: 1 })
      .lean();
    const [student, cls] = await Promise.all([
      this.students.findById(q.studentId, { code: 1, fullName: 1 }).lean(),
      this.classes.findById(q.classId, { code: 1, name: 1 }).lean(),
    ]);
    if (!enrollment || !student || !cls) throw new AppError(ErrorCode.NOT_FOUND);
    const [result] = await this.buildResults([
      { studentId: student._id, classId: cls._id, courseId: enrollment.courseId },
    ]);
    const buffer = await this.pdf.render(buildTranscript({ student, cls, result }));
    return { buffer, filename: `phieu-diem-${student.code}-${cls.code}.pdf` };
  }
}
