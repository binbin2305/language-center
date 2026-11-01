import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { reportsApi, type ReportParams } from './api';

const opts = (enabled: boolean) => ({ enabled, placeholderData: keepPreviousData });

export const useAdmissionsReport = (p: ReportParams, enabled = true) =>
  useQuery({ queryKey: ['reports', 'admissions', p], queryFn: () => reportsApi.admissions(p), ...opts(enabled) });
export const useAttendanceReport = (p: ReportParams, enabled = true) =>
  useQuery({ queryKey: ['reports', 'attendance', p], queryFn: () => reportsApi.attendance(p), ...opts(enabled) });
export const useAcademicReport = (p: ReportParams, enabled = true) =>
  useQuery({ queryKey: ['reports', 'academic', p], queryFn: () => reportsApi.academic(p), ...opts(enabled) });
export const useFinanceReport = (p: ReportParams, enabled = true) =>
  useQuery({ queryKey: ['reports', 'finance', p], queryFn: () => reportsApi.finance(p), ...opts(enabled) });
