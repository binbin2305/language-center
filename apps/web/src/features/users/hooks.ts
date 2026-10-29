import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, type UserListParams } from './api';

const KEY = 'users';

export const useUsers = (params: UserListParams) =>
  useQuery({ queryKey: [KEY, 'list', params], queryFn: () => usersApi.list(params) });

/** Teacher picker options (GET /teachers); used by class and schedule screens. */
export const useTeachers = (enabled = true) =>
  useQuery({ queryKey: ['teachers'], queryFn: usersApi.teachers, enabled, staleTime: 60_000 });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

const useUserAction = (fn: (id: string) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }) });
};
export const useLockUser = () => useUserAction(usersApi.lock);
export const useUnlockUser = () => useUserAction(usersApi.unlock);

export function useResetPassword() {
  return useMutation({ mutationFn: usersApi.resetPassword });
}
