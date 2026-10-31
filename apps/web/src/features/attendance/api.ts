import type {
  AttendanceDto,
  AttendanceSummaryQuery,
  AttendanceSummaryRowDto,
  ListAttendanceQuery,
  ListSessionsQuery,
  SessionAttendanceDto,
  SessionDto,
  SettingsDto,
  TakeAttendanceInput,
  UpdateAttendanceInput,
} from '@lc/shared';
import { addVnDays } from '@lc/shared';
import { apiGet, apiGetPage, apiPatch, apiPut } from '@/lib/api';

export type AttendanceListParams = Partial<Omit<ListAttendanceQuery, 'page' | 'limit' | 'sort'>>;
export type AttendanceSummaryParams = Omit<AttendanceSummaryQuery, 'groupBy'> & { groupBy: 'student' | 'class' };

const MAX_LIMIT = 100;
/** GET /sessions caps one request at 92 days (inclusive). */
const MAX_SESSION_DAYS = 92;

export const attendanceApi = {
  session: (sessionId: string) => apiGet<SessionDto>(`sessions/${sessionId}`),
  settings: () => apiGet<SettingsDto>('settings'),
  get: (sessionId: string) => apiGet<SessionAttendanceDto>(`sessions/${sessionId}/attendance`),
  take: (sessionId: string, body: TakeAttendanceInput) =>
    apiPut<SessionAttendanceDto>(`sessions/${sessionId}/attendance`, body),
  update: (sessionId: string, body: UpdateAttendanceInput) =>
    apiPatch<SessionAttendanceDto>(`sessions/${sessionId}/attendance`, body),
  summary: (params: AttendanceSummaryParams) =>
    apiGet<AttendanceSummaryRowDto[]>('attendance/summary', params),
  /** Every attendance record matching the filters (pages through the 100-row cap). */
  listAll: async (params: AttendanceListParams): Promise<AttendanceDto[]> => {
    const all: AttendanceDto[] = [];
    for (let page = 1; ; page += 1) {
      const res = await apiGetPage<AttendanceDto>('attendance', { ...params, page, limit: MAX_LIMIT });
      all.push(...res.data);
      if (all.length >= res.meta.total || res.data.length === 0) return all;
    }
  },
  sessions: (params: ListSessionsQuery) => apiGet<SessionDto[]>('sessions', params),
  /** Every session of a class in [from, to], fetched in consecutive windows of at most 92 days. */
  classSessionsAll: async (classId: string, from: string, to: string): Promise<SessionDto[]> => {
    const all: SessionDto[] = [];
    for (let start = from; start <= to; start = addVnDays(start, MAX_SESSION_DAYS)) {
      const cap = addVnDays(start, MAX_SESSION_DAYS - 1);
      all.push(...(await apiGet<SessionDto[]>('sessions', { classId, from: start, to: cap < to ? cap : to })));
    }
    return all;
  },
};
