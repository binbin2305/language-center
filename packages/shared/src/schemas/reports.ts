import { z } from 'zod';
import { GradeClass } from '../enums';
import { zDateOnly, zMoney, zObjectId } from './common';

const range = { from: zDateOnly, to: zDateOnly };

export const AdmissionsReportQuery = z.object({ ...range, courseId: zObjectId.optional() });
export type AdmissionsReportQuery = z.infer<typeof AdmissionsReportQuery>;

export const AttendanceReportQuery = z.object({
  ...range,
  classId: zObjectId.optional(),
  courseId: zObjectId.optional(),
});
export type AttendanceReportQuery = z.infer<typeof AttendanceReportQuery>;

export const AcademicReportQuery = z.object({
  ...range,
  classId: zObjectId.optional(),
  courseId: zObjectId.optional(),
  teacherId: zObjectId.optional(),
});
export type AcademicReportQuery = z.infer<typeof AcademicReportQuery>;

export const FinanceGroupBy = z.enum(['month', 'course', 'class']);
export type FinanceGroupBy = z.infer<typeof FinanceGroupBy>;

export const FinanceReportQuery = z.object({
  ...range,
  courseId: zObjectId.optional(),
  classId: zObjectId.optional(),
  groupBy: FinanceGroupBy.default('month'),
});
export type FinanceReportQuery = z.infer<typeof FinanceReportQuery>;

export const ReportTypeParam = z.enum(['admissions', 'attendance', 'academic', 'finance']);
export type ReportTypeParam = z.infer<typeof ReportTypeParam>;

/** GET /reports/:type/export — query is the union of report filters + format. */
export const ExportReportQuery = z.object({
  format: z.enum(['xlsx', 'pdf']),
  from: zDateOnly,
  to: zDateOnly,
  courseId: zObjectId.optional(),
  classId: zObjectId.optional(),
  teacherId: zObjectId.optional(),
  groupBy: FinanceGroupBy.optional(),
});
export type ExportReportQuery = z.infer<typeof ExportReportQuery>;

const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);

/** FR-RPT-06 */
export const DashboardDto = z.object({
  activeStudents: count,
  ongoingClasses: count,
  sessionsToday: count,
  overdueInvoices: count,
  waitingEnrollments: count,
});
export type DashboardDto = z.infer<typeof DashboardDto>;

/** FR-RPT-01 */
export const AdmissionsReportDto = z.object({
  totals: z.object({
    leads: count,
    newProfiles: count,
    conversionRate: rate,
    enrolled: count,
    waiting: count,
  }),
  rows: z.array(
    z.object({
      courseId: zObjectId,
      courseName: z.string(),
      leads: count,
      newProfiles: count,
      conversionRate: rate,
      enrolled: count,
      waiting: count,
    }),
  ),
});
export type AdmissionsReportDto = z.infer<typeof AdmissionsReportDto>;

/** FR-RPT-02 */
export const AttendanceReportDto = z.object({
  byClass: z.array(
    z.object({ classId: zObjectId, classCode: z.string(), sessions: count, records: count, attendanceRate: rate }),
  ),
  byStudent: z.array(
    z.object({
      studentId: zObjectId,
      studentCode: z.string(),
      fullName: z.string(),
      classId: zObjectId,
      records: count,
      absences: count,
      attendanceRate: rate,
    }),
  ),
  overThreshold: z.array(
    z.object({
      studentId: zObjectId,
      studentCode: z.string(),
      fullName: z.string(),
      classId: zObjectId,
      classCode: z.string(),
      absenceRate: rate,
    }),
  ),
});
export type AttendanceReportDto = z.infer<typeof AttendanceReportDto>;

/** FR-RPT-03 */
export const AcademicReportDto = z.object({
  rows: z.array(
    z.object({
      classId: zObjectId,
      classCode: z.string(),
      courseId: zObjectId,
      teacherId: zObjectId,
      teacherName: z.string().optional(),
      students: count,
      averageScore: z.number().nullable(),
      passRate: rate.nullable(),
    }),
  ),
  distribution: z.record(z.nativeEnum(GradeClass), count),
  passRate: rate,
  failRate: rate,
});
export type AcademicReportDto = z.infer<typeof AcademicReportDto>;

/** FR-RPT-04 */
export const FinanceReportDto = z.object({
  totals: z.object({
    revenue: zMoney,
    totalDue: zMoney,
    outstanding: zMoney,
    overdue: zMoney,
    totalDiscount: zMoney,
  }),
  rows: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      revenue: zMoney,
      totalDue: zMoney,
      outstanding: zMoney,
      overdue: zMoney,
      totalDiscount: zMoney,
    }),
  ),
});
export type FinanceReportDto = z.infer<typeof FinanceReportDto>;
