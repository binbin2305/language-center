import type {
  ClassDto,
  ClassStudentDto,
  CreateClassInput,
  ListClassesQuery,
  UpdateClassInput,
} from '@lc/shared';
import { apiDelete, apiGet, apiGetPage, apiPatch, apiPost } from '@/lib/api';

export type ClassListParams = Partial<
  Pick<ListClassesQuery, 'page' | 'limit' | 'courseId' | 'level' | 'status' | 'hasSeat' | 'q'>
>;

export const classesApi = {
  list: (params: ClassListParams) => apiGetPage<ClassDto>('classes', params),
  get: (id: string) => apiGet<ClassDto>(`classes/${id}`),
  create: (input: CreateClassInput) => apiPost<ClassDto>('classes', input),
  update: (id: string, input: UpdateClassInput) => apiPatch<ClassDto>(`classes/${id}`, input),
  remove: (id: string) => apiDelete(`classes/${id}`),
  deactivate: (id: string) => apiPost<ClassDto>(`classes/${id}/deactivate`),
  roster: (id: string, params: { page: number; limit: number }) =>
    apiGetPage<ClassStudentDto>(`classes/${id}/students`, params),
};
