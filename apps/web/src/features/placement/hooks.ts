import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddCandidatesInput, PutPlacementResultsInput } from '@lc/shared';
import { placementApi, type PlacementListParams } from './api';

const KEY = 'placement-tests';

export const usePlacementTests = (params: PlacementListParams) =>
  useQuery({ queryKey: [KEY, 'list', params], queryFn: () => placementApi.list(params) });

export const usePlacementTest = (id: string | undefined) =>
  useQuery({ queryKey: [KEY, 'detail', id], queryFn: id ? () => placementApi.get(id) : skipToken });

export const usePendingEnrollments = (courseId: string | undefined) =>
  useQuery({
    queryKey: ['enrollments', 'pending-placement', courseId],
    queryFn: courseId ? () => placementApi.pendingEnrollments(courseId) : skipToken,
  });

export function useCreatePlacementTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: placementApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useAddCandidates(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddCandidatesInput) => placementApi.addCandidates(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function usePutResults(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PutPlacementResultsInput) => placementApi.putResults(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
