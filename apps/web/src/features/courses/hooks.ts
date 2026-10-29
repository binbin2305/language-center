import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateCourseInput } from '@lc/shared';
import { coursesApi, type CourseListParams } from './api';

const KEY = 'courses';

export const useCourses = (params: CourseListParams, enabled = true) =>
  useQuery({ queryKey: [KEY, 'list', params], queryFn: () => coursesApi.list(params), enabled });

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: coursesApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCourseInput }) => coursesApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
