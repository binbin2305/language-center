import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EnrollmentStatus, LeadStatus, type AdmissionsReportDto, type AdmissionsReportQuery } from '@lc/shared';
import { Models } from '../../database/models';
import type { Course } from '../../database/schemas/course.schema';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { Lead } from '../../database/schemas/lead.schema';
import type { Student } from '../../database/schemas/student.schema';
import { rate } from './report-math';
import { vnRange } from './report-range';

type Row = AdmissionsReportDto['rows'][number];

/** FR-RPT-01 (D26). Read-only aggregation over leads, students and enrollments. */
@Injectable()
export class AdmissionsReportService {
  constructor(
    @InjectModel(Models.Lead) private readonly leads: Model<Lead>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Course) private readonly courses: Model<Course>,
  ) {}

  async get(q: AdmissionsReportQuery): Promise<AdmissionsReportDto> {
    const { start, end } = vnRange(q.from, q.to);
    const course = q.courseId ? new Types.ObjectId(q.courseId) : null;
    const inRange = { $gte: start, $lt: end };

    const [leadDocs, studentDocs, enrolledAgg, waitingAgg] = await Promise.all([
      this.leads
        .find({ deletedAt: null, createdAt: inRange, ...(course && { interestedCourseId: course }) }, { interestedCourseId: 1, status: 1 })
        .lean(),
      this.students.find({ deletedAt: null, createdAt: inRange }, { leadId: 1 }).lean(),
      this.enrollments.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { history: { $elemMatch: { to: EnrollmentStatus.ENROLLED, at: inRange } }, ...(course && { courseId: course }) } },
        { $group: { _id: '$courseId', n: { $sum: 1 } } },
      ]),
      this.enrollments.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { status: EnrollmentStatus.WAITING_CLASS, ...(course && { courseId: course }) } },
        { $group: { _id: '$courseId', n: { $sum: 1 } } },
      ]),
    ]);

    // A new profile's course = its lead's interested course, else its earliest enrollment's course.
    const studentIds = studentDocs.map((s) => s._id);
    const leadIds = studentDocs.map((s) => s.leadId).filter((x): x is Types.ObjectId => !!x);
    const [srcLeads, srcEnrollments] = await Promise.all([
      this.leads.find({ _id: { $in: leadIds } }, { interestedCourseId: 1 }).lean(),
      this.enrollments.find({ studentId: { $in: studentIds } }, { studentId: 1, courseId: 1 }).sort({ createdAt: 1 }).lean(),
    ]);
    const leadCourse = new Map(srcLeads.map((l) => [l._id.toString(), l.interestedCourseId.toString()]));
    const enrCourse = new Map<string, string>();
    for (const e of srcEnrollments) if (!enrCourse.has(e.studentId.toString())) enrCourse.set(e.studentId.toString(), e.courseId.toString());
    const profileCourses = studentDocs.map((s) => (s.leadId && leadCourse.get(s.leadId.toString())) || enrCourse.get(s._id.toString()) || null);

    const blank = (): Omit<Row, 'courseId' | 'courseName'> => ({ leads: 0, newProfiles: 0, conversionRate: 0, enrolled: 0, waiting: 0 });
    const acc = new Map<string, ReturnType<typeof blank> & { converted: number }>();
    const at = (id: string) => {
      if (!acc.has(id)) acc.set(id, { ...blank(), converted: 0 });
      return acc.get(id)!;
    };
    if (course) at(q.courseId!);
    for (const l of leadDocs) {
      const r = at(l.interestedCourseId.toString());
      r.leads++;
      if (l.status === LeadStatus.PROFILE_CREATED) r.converted++;
    }
    let profilesTotal = 0;
    for (const c of profileCourses) {
      if (course && c !== q.courseId) continue;
      profilesTotal++;
      if (c) at(c).newProfiles++;
    }
    for (const e of enrolledAgg) at(e._id.toString()).enrolled = e.n;
    for (const w of waitingAgg) at(w._id.toString()).waiting = w.n;

    const names = new Map(
      (await this.courses.find({ _id: { $in: [...acc.keys()].map((k) => new Types.ObjectId(k)) } }, { name: 1 }).lean()).map((c) => [c._id.toString(), c.name]),
    );
    const rows: Row[] = [...acc.entries()]
      .map(([courseId, r]) => ({
        courseId,
        courseName: names.get(courseId) ?? '',
        leads: r.leads,
        newProfiles: r.newProfiles,
        conversionRate: rate(r.converted, r.leads),
        enrolled: r.enrolled,
        waiting: r.waiting,
      }))
      .sort((a, b) => a.courseName.localeCompare(b.courseName));

    const sum = (k: 'enrolled' | 'waiting') => rows.reduce((s, r) => s + r[k], 0);
    const converted = [...acc.values()].reduce((s, r) => s + r.converted, 0);
    return {
      totals: { leads: leadDocs.length, newProfiles: profilesTotal, conversionRate: rate(converted, leadDocs.length), enrolled: sum('enrolled'), waiting: sum('waiting') },
      rows,
    };
  }
}
