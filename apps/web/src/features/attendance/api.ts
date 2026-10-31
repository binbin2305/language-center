import type {
  SessionAttendanceDto,
  SessionDto,
  SettingsDto,
  TakeAttendanceInput,
  UpdateAttendanceInput,
} from '@lc/shared';
import { apiGet, apiPatch, apiPut } from '@/lib/api';

export const attendanceApi = {
  session: (sessionId: string) => apiGet<SessionDto>(`sessions/${sessionId}`),
  settings: () => apiGet<SettingsDto>('settings'),
  get: (sessionId: string) => apiGet<SessionAttendanceDto>(`sessions/${sessionId}/attendance`),
  take: (sessionId: string, body: TakeAttendanceInput) =>
    apiPut<SessionAttendanceDto>(`sessions/${sessionId}/attendance`, body),
  update: (sessionId: string, body: UpdateAttendanceInput) =>
    apiPatch<SessionAttendanceDto>(`sessions/${sessionId}/attendance`, body),
};
