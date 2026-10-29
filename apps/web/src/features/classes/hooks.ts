import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateClassInput, UpdateClassInput } from '@lc/shared';
import { catalogApi, classesApi, type ClassListParams } from './api';

const KEY = 'classes';

export const useClasses = (params: ClassListParams) =>
  useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: () => classesApi.list(params),
    placeholderData: keepPreviousData,
  });

export const useClass = (id: string) =>
  useQuery({ queryKey: [KEY, 'detail', id], queryFn: () => classesApi.get(id) });

export const useClassRoster = (id: string, page: number, limit = 20) =>
  useQuery({
    queryKey: [KEY, 'roster', id, page, limit],
    queryFn: () => classesApi.roster(id, { page, limit }),
    placeholderData: keepPreviousData,
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useCreateClass() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateClassInput) => classesApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateClass(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateClassInput) => classesApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteClass() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: classesApi.remove, onSuccess: invalidate });
}

export function useDeactivateClass() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: classesApi.deactivate, onSuccess: invalidate });
}

// TODO W1-MERGE: use catalog hooks
export const useTeacherOptions = () =>
  useQuery({ queryKey: ['catalog', 'teachers'], queryFn: catalogApi.teachers, select: (r) => r.data });
export const useCourseOptions = () =>
  useQuery({ queryKey: ['catalog', 'courses'], queryFn: catalogApi.courses, select: (r) => r.data });
/** `GET /rooms` is M,S only: pass `enabled=false` for other roles. */
export const useRoomOptions = (enabled = true) =>
  useQuery({ queryKey: ['catalog', 'rooms'], queryFn: catalogApi.rooms, select: (r) => r.data, enabled });
