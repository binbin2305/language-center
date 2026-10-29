import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateClassInput, UpdateClassInput } from '@lc/shared';
import { classesApi, type ClassListParams } from './api';

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
