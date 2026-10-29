import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Role, type UserDto } from '@lc/shared';
import { usersApi, type UserListParams } from './api';

const KEY = 'users';

/** Refreshes the users lists, and the teacher pickers when the account is a TEACHER. */
const invalidateFor = (qc: QueryClient, user: Pick<UserDto, 'role'>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: [KEY] }),
    user.role === Role.TEACHER ? qc.invalidateQueries({ queryKey: ['teachers'] }) : undefined,
  ]);

export const useUsers = (params: UserListParams) =>
  useQuery({ queryKey: [KEY, 'list', params], queryFn: () => usersApi.list(params) });

/** Teacher picker options (GET /teachers); used by class and schedule screens. */
export const useTeachers = (enabled = true) =>
  useQuery({ queryKey: ['teachers'], queryFn: usersApi.teachers, enabled, staleTime: 60_000 });

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usersApi.create,
    onSuccess: (r) => invalidateFor(qc, r.user),
  });
}

const useUserAction = (fn: (id: string) => Promise<UserDto>) => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (u) => invalidateFor(qc, u) });
};
export const useLockUser = () => useUserAction(usersApi.lock);
export const useUnlockUser = () => useUserAction(usersApi.unlock);

export function useResetPassword() {
  return useMutation({ mutationFn: usersApi.resetPassword });
}
