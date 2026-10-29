import type {
  BulkCreateSessionsResultDto,
  CancelFutureSessionsResultDto,
  CheckConflictsInput,
  CheckConflictsResultDto,
  CreateSessionInput,
  CreateSessionResultDto,
  BulkCreateSessionsInput,
  ListSessionsQuery,
  SessionDto,
  UpdateSessionInput,
} from '@lc/shared';
import { apiGet, apiPatch, apiPost } from '@/lib/api';

export type SessionListParams = ListSessionsQuery;

// Class / room / teacher pickers use the shared EntitySelect (catalog + classes endpoints).
// TODO W1-MERGE: replace with the catalog / classes hooks once those lanes land on main.
export const scheduleApi = {
  list: (params: SessionListParams) => apiGet<SessionDto[]>('sessions', params),
  checkConflicts: (body: CheckConflictsInput) =>
    apiPost<CheckConflictsResultDto>('sessions/check-conflicts', body),
  checkBulkConflicts: (body: BulkCreateSessionsInput) =>
    apiPost<CheckConflictsResultDto>('sessions/bulk/check-conflicts', body),
  create: (body: CreateSessionInput) => apiPost<CreateSessionResultDto>('sessions', body),
  createBulk: (body: BulkCreateSessionsInput) => apiPost<BulkCreateSessionsResultDto>('sessions/bulk', body),
  update: (id: string, body: UpdateSessionInput) => apiPatch<CreateSessionResultDto>(`sessions/${id}`, body),
  cancel: (id: string, reason: string) => apiPost<SessionDto>(`sessions/${id}/cancel`, { reason }),
  cancelFuture: (classId: string, reason: string) =>
    apiPost<CancelFutureSessionsResultDto>(`classes/${classId}/sessions/cancel-future`, { reason }),
};
