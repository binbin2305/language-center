import type {
  AddCandidatesInput,
  CreatePlacementTestInput,
  EnrollmentDto,
  ListPlacementTestsQuery,
  PlacementTestDto,
  PutPlacementResultsInput,
} from '@lc/shared';
import { apiGet, apiGetPage, apiPost, apiPut } from '@/lib/api';

export type PlacementListParams = Partial<Pick<ListPlacementTestsQuery, 'page' | 'limit' | 'status' | 'courseId'>>;

export const placementApi = {
  list: (params: PlacementListParams) => apiGetPage<PlacementTestDto>('placement-tests', params),
  get: (id: string) => apiGet<PlacementTestDto>(`placement-tests/${id}`),
  create: (body: CreatePlacementTestInput) => apiPost<PlacementTestDto>('placement-tests', body),
  addCandidates: (id: string, body: AddCandidatesInput) =>
    apiPost<PlacementTestDto>(`placement-tests/${id}/candidates`, body),
  putResults: (id: string, body: PutPlacementResultsInput) =>
    apiPut<PlacementTestDto>(`placement-tests/${id}/results`, body),
  /** Students of a course still waiting for a placement test (M, S). */
  pendingEnrollments: (courseId: string) =>
    apiGetPage<EnrollmentDto>('enrollments', { status: 'PENDING_PLACEMENT', courseId, limit: 100 }),
};
