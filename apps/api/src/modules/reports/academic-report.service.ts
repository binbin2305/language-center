import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ALL_GRADE_CLASSES,
  classify,
  isPass,
  weightedAverage,
  type AcademicReportDto,
  type AcademicReportQuery,
  type GradeClass,
} from '@lc/shared';
import { Models } from '../../database/models';
import type { Assessment } from '../../database/schemas/assessment.schema';
import type { Class } from '../../database/schemas/class.schema';
import type { Grade } from '../../database/schemas/grade.schema';
import type { User } from '../../database/schemas/user.schema';
import { rate, round2 } from './report-math';
import { vnRange } from './report-range';

/** FR-RPT-03 (D26). Read-only; only confirmed assessments held within the range count. */
@Injectable()
export class AcademicReportService {
  constructor(
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Assessment) private readonly assessments: Model<Assessment>,
    @InjectModel(Models.Grade) private readonly grades: Model<Grade>,
    @InjectModel(Models.User) private readonly users: Model<User>,
  ) {}

  async get(q: AcademicReportQuery): Promise<AcademicReportDto> {
    const { start, end } = vnRange(q.from, q.to);
    const match: Record<string, unknown> = {};
    if (q.classId) match._id = new Types.ObjectId(q.classId);
    if (q.courseId) match.courseId = new Types.ObjectId(q.courseId);
    if (q.teacherId) match.teacherId = new Types.ObjectId(q.teacherId);
    const classDocs = await this.classes.find(match, { code: 1, courseId: 1, teacherId: 1 }).sort({ code: 1 }).lean();
    const classIds = classDocs.map((c) => c._id);

    const assessmentDocs = await this.assessments
      .find({ classId: { $in: classIds }, confirmedAt: { $ne: null }, heldOn: { $gte: start, $lt: end } }, { weight: 1 })
      .lean();
    const weights = new Map(assessmentDocs.map((a) => [a._id.toString(), a.weight]));
    const gradeDocs = await this.grades
      .find({ assessmentId: { $in: assessmentDocs.map((a) => a._id) }, score: { $ne: null } }, { classId: 1, studentId: 1, assessmentId: 1, score: 1 })
      .lean();

    const perStudent = new Map<string, { classId: string; items: { score: number | null; weight: number }[] }>();
    for (const g of gradeDocs) {
      const key = `${g.classId.toString()}:${g.studentId.toString()}`;
      const e = perStudent.get(key) ?? { classId: g.classId.toString(), items: [] };
      e.items.push({ score: g.score, weight: weights.get(g.assessmentId.toString()) ?? 0 });
      perStudent.set(key, e);
    }
    const perClass = new Map<string, number[]>();
    for (const { classId, items } of perStudent.values()) {
      const avg = weightedAverage(items);
      if (avg === null) continue;
      perClass.set(classId, [...(perClass.get(classId) ?? []), avg]);
    }

    const teacherNames = new Map(
      (await this.users.find({ _id: { $in: [...new Set(classDocs.map((c) => c.teacherId.toString()))].map((i) => new Types.ObjectId(i)) } }, { fullName: 1 }).lean()).map(
        (u) => [u._id.toString(), u.fullName],
      ),
    );

    const distribution = Object.fromEntries(ALL_GRADE_CLASSES.map((g) => [g, 0])) as Record<GradeClass, number>;
    let passed = 0;
    let graded = 0;
    const rows = classDocs.map((c) => {
      const avgs = perClass.get(c._id.toString()) ?? [];
      const pass = avgs.filter(isPass).length;
      for (const a of avgs) distribution[classify(a)]++;
      passed += pass;
      graded += avgs.length;
      const name = teacherNames.get(c.teacherId.toString());
      return {
        classId: c._id.toString(),
        classCode: c.code,
        courseId: c.courseId.toString(),
        teacherId: c.teacherId.toString(),
        ...(name !== undefined && { teacherName: name }),
        students: avgs.length,
        averageScore: avgs.length ? round2(avgs.reduce((s, x) => s + x, 0) / avgs.length) : null,
        passRate: avgs.length ? rate(pass, avgs.length) : null,
      };
    });
    return { rows, distribution, passRate: rate(passed, graded), failRate: rate(graded - passed, graded) };
  }
}
