import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  absenceRate,
  attendanceRate,
  SessionStatus,
  type AttendanceCounts,
  type AttendanceReportDto,
  type AttendanceReportQuery,
  type AttendanceStatus,
} from '@lc/shared';
import { SettingsService } from '../../common/settings/settings.service';
import { Models } from '../../database/models';
import type { Attendance } from '../../database/schemas/attendance.schema';
import type { Class } from '../../database/schemas/class.schema';
import type { Student } from '../../database/schemas/student.schema';
import { round4 } from './report-math';
import { vnRange } from './report-range';

interface StatusRow {
  _id: { c: Types.ObjectId; s: Types.ObjectId; st: AttendanceStatus };
  n: number;
}

const total = (c: AttendanceCounts) => Object.values(c).reduce<number>((a, n) => a + (n ?? 0), 0);

/** FR-RPT-02 (D26). Read-only; same session filter as GET /attendance/summary (cancelled sessions dropped). */
@Injectable()
export class AttendanceReportService {
  constructor(
    @InjectModel(Models.Attendance) private readonly attendances: Model<Attendance>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly settings: SettingsService,
  ) {}

  async get(q: AttendanceReportQuery): Promise<AttendanceReportDto> {
    const { start, end } = vnRange(q.from, q.to);
    const { attendanceWarningThreshold } = await this.settings.get();

    const classMatch: Record<string, unknown> = {};
    if (q.courseId) classMatch.courseId = new Types.ObjectId(q.courseId);
    if (q.classId) classMatch._id = new Types.ObjectId(q.classId);
    const scoped = Object.keys(classMatch).length > 0;
    const classDocs = scoped ? await this.classes.find(classMatch, { code: 1 }).lean() : null;

    const prefix = [
      ...(classDocs ? [{ $match: { classId: { $in: classDocs.map((c) => c._id) } } }] : []),
      { $lookup: { from: 'sessions', localField: 'sessionId', foreignField: '_id', as: 'session' } },
      { $unwind: '$session' },
      { $match: { 'session.status': { $ne: SessionStatus.CANCELLED }, 'session.startAt': { $gte: start, $lt: end } } },
    ];
    const [statusRows, sessionRows] = await Promise.all([
      this.attendances.aggregate<StatusRow>([...prefix, { $group: { _id: { c: '$classId', s: '$studentId', st: '$status' }, n: { $sum: 1 } } }]),
      this.attendances.aggregate<{ _id: Types.ObjectId; n: number }>([
        ...prefix,
        { $group: { _id: { c: '$classId', ss: '$sessionId' } } },
        { $group: { _id: '$_id.c', n: { $sum: 1 } } },
      ]),
    ]);

    const perClass = new Map<string, AttendanceCounts>();
    const perStudent = new Map<string, { classId: string; studentId: string; counts: AttendanceCounts }>();
    for (const r of statusRows) {
      const c = r._id.c.toString();
      const key = `${c}:${r._id.s.toString()}`;
      const cc = perClass.get(c) ?? {};
      cc[r._id.st] = (cc[r._id.st] ?? 0) + r.n;
      perClass.set(c, cc);
      const ps = perStudent.get(key) ?? { classId: c, studentId: r._id.s.toString(), counts: {} };
      ps.counts[r._id.st] = (ps.counts[r._id.st] ?? 0) + r.n;
      perStudent.set(key, ps);
    }

    const classIds = [...perClass.keys()].map((k) => new Types.ObjectId(k));
    const studentIds = [...new Set([...perStudent.values()].map((p) => p.studentId))].map((k) => new Types.ObjectId(k));
    const [codeDocs, studentDocs] = await Promise.all([
      classDocs ?? this.classes.find({ _id: { $in: classIds } }, { code: 1 }).lean(),
      this.students.find({ _id: { $in: studentIds } }, { code: 1, fullName: 1 }).lean(),
    ]);
    const codes = new Map(codeDocs.map((c) => [c._id.toString(), c.code]));
    const people = new Map(studentDocs.map((s) => [s._id.toString(), s]));
    const sessionCount = new Map(sessionRows.map((s) => [s._id.toString(), s.n]));

    const byClass = [...perClass]
      .map(([classId, c]) => ({
        classId,
        classCode: codes.get(classId) ?? '',
        sessions: sessionCount.get(classId) ?? 0,
        records: total(c),
        attendanceRate: round4(attendanceRate(c) ?? 0),
      }))
      .sort((a, b) => a.classCode.localeCompare(b.classCode));

    const students = [...perStudent.values()].map((p) => {
      const s = people.get(p.studentId);
      return {
        studentId: p.studentId,
        studentCode: s?.code ?? '',
        fullName: s?.fullName ?? '',
        classId: p.classId,
        classCode: codes.get(p.classId) ?? '',
        records: total(p.counts),
        absences: (p.counts.EXCUSED ?? 0) + (p.counts.UNEXCUSED ?? 0),
        attendanceRate: round4(attendanceRate(p.counts) ?? 0),
        absenceRate: round4(absenceRate(p.counts)),
        rawAbsenceRate: absenceRate(p.counts),
      };
    });
    students.sort((a, b) => a.classCode.localeCompare(b.classCode) || a.studentCode.localeCompare(b.studentCode));

    return {
      byClass,
      byStudent: students.map((s) => ({
        studentId: s.studentId,
        studentCode: s.studentCode,
        fullName: s.fullName,
        classId: s.classId,
        records: s.records,
        absences: s.absences,
        attendanceRate: s.attendanceRate,
      })),
      overThreshold: students
        .filter((s) => s.rawAbsenceRate > attendanceWarningThreshold)
        .sort((a, b) => b.rawAbsenceRate - a.rawAbsenceRate || a.studentCode.localeCompare(b.studentCode))
        .map((s) => ({
          studentId: s.studentId,
          studentCode: s.studentCode,
          fullName: s.fullName,
          classId: s.classId,
          classCode: s.classCode,
          absenceRate: s.absenceRate,
        })),
    };
  }
}
