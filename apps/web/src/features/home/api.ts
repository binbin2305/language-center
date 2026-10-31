import type {
  AttendanceSummaryRowDto,
  InvoiceDto,
  PlacementTestDto,
  ResultDto,
  SessionDto,
} from '@lc/shared';
import { apiGet, apiGetPage } from '@/lib/api';

// GET-only reads for the teacher / student home (D27): features that do not export a hook for
// these endpoints are called here, never modified.
export const homeApi = {
  sessions: (from: string, to: string) => apiGet<SessionDto[]>('sessions', { from, to }),
  upcomingPlacementTests: (from: string) =>
    apiGetPage<PlacementTestDto>('placement-tests', { from, page: 1, limit: 5 }),
  attendanceSummary: () => apiGet<AttendanceSummaryRowDto[]>('attendance/summary', { groupBy: 'student' }),
  results: () => apiGetPage<ResultDto>('results', { page: 1, limit: 100 }),
  invoices: () => apiGetPage<InvoiceDto>('invoices', { page: 1, limit: 100 }),
};
