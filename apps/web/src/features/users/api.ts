import type {
  CreateUserInput, CreateUserResultDto, ListUsersQuery, ResetPasswordResultDto, TeacherOptionDto, UserDto,
} from '@lc/shared';
import { apiGet, apiGetPage, apiPost } from '@/lib/api';

export type UserListParams = Partial<Pick<ListUsersQuery, 'page' | 'limit' | 'sort' | 'role' | 'status' | 'q'>>;

export const usersApi = {
  list: (params: UserListParams) => apiGetPage<UserDto>('users', params),
  create: (input: CreateUserInput) => apiPost<CreateUserResultDto>('users', input),
  lock: (id: string) => apiPost<UserDto>(`users/${id}/lock`),
  unlock: (id: string) => apiPost<UserDto>(`users/${id}/unlock`),
  resetPassword: (id: string) => apiPost<ResetPasswordResultDto>(`users/${id}/reset-password`),
  teachers: () => apiGet<TeacherOptionDto[]>('teachers'),
};
