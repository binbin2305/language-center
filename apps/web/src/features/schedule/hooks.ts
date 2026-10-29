import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateSessionInput } from '@lc/shared';
import { scheduleApi, type SessionListParams } from './api';

const KEY = 'sessions';

export const useSessions = (params: SessionListParams | null) =>
  useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: params ? () => scheduleApi.list(params) : skipToken,
  });

export const useCheckConflicts = () => useMutation({ mutationFn: scheduleApi.checkConflicts });
export const useCheckBulkConflicts = () => useMutation({ mutationFn: scheduleApi.checkBulkConflicts });

function useInvalidating<TVars, TData>(fn: (v: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) });
}

export const useCreateSession = () => useInvalidating(scheduleApi.create);
export const useCreateBulkSessions = () => useInvalidating(scheduleApi.createBulk);
export const useUpdateSession = () =>
  useInvalidating((v: { id: string; body: UpdateSessionInput }) => scheduleApi.update(v.id, v.body));
export const useCancelSession = () =>
  useInvalidating((v: { id: string; reason: string }) => scheduleApi.cancel(v.id, v.reason));
export const useCancelFutureSessions = () =>
  useInvalidating((v: { classId: string; reason: string }) => scheduleApi.cancelFuture(v.classId, v.reason));
