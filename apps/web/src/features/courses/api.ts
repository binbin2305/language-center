import type { CourseDto, CreateCourseInput, ListCoursesQuery, UpdateCourseInput } from '@lc/shared';
import { apiGetPage, apiPatch, apiPost } from '@/lib/api';

export type CourseListParams = Partial<Pick<ListCoursesQuery, 'page' | 'limit' | 'sort' | 'status' | 'language' | 'q'>>;

export const coursesApi = {
  list: (params: CourseListParams) => apiGetPage<CourseDto>('courses', params),
  create: (input: CreateCourseInput) => apiPost<CourseDto>('courses', input),
  update: (id: string, input: UpdateCourseInput) => apiPatch<CourseDto>(`courses/${id}`, input),
};
