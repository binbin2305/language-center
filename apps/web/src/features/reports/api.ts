import type {
  AcademicReportDto,
  AdmissionsReportDto,
  AttendanceReportDto,
  FinanceReportDto,
  ReportTypeParam,
} from '@lc/shared';
import { apiGet, apiGetBlob } from '@/lib/api';

export interface ReportParams {
  from: string;
  to: string;
  courseId?: string;
  classId?: string;
  teacherId?: string;
  groupBy?: 'month' | 'course' | 'class';
}

const clean = (p: ReportParams) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== '')) as Record<string, string>;

export const exportPath = (type: ReportTypeParam, format: 'xlsx' | 'pdf', p: ReportParams) =>
  `reports/${type}/export?${new URLSearchParams({ format, ...clean(p) }).toString()}`;

export const reportsApi = {
  admissions: (p: ReportParams) => apiGet<AdmissionsReportDto>('reports/admissions', clean(p)),
  attendance: (p: ReportParams) => apiGet<AttendanceReportDto>('reports/attendance', clean(p)),
  academic: (p: ReportParams) => apiGet<AcademicReportDto>('reports/academic', clean(p)),
  finance: (p: ReportParams) => apiGet<FinanceReportDto>('reports/finance', clean(p)),
  download: (type: ReportTypeParam, format: 'xlsx' | 'pdf', p: ReportParams) =>
    apiGetBlob(exportPath(type, format, p)),
};
