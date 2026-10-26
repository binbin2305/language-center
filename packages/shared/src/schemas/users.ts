import { z } from 'zod';
import { ALL_ROLES, Role, UserStatus } from '../enums';
import { TeacherProfile } from './auth';
import { zDateTime, zDtoBase, zEmail, zObjectId, zPagination, zVnPhone } from './common';

export const CreateUserInput = z.object({
  email: zEmail,
  fullName: z.string().trim().min(2).max(100),
  phone: zVnPhone.optional(),
  role: z.nativeEnum(Role),
  teacherProfile: TeacherProfile.optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

/** PATCH /users/:id — email (username) and role are immutable here. */
export const UpdateUserInput = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    phone: zVnPhone,
    status: z.nativeEnum(UserStatus),
    teacherProfile: TeacherProfile,
  })
  .partial()
  .strict();
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

export const ListUsersQuery = zPagination.extend({
  role: z.enum(ALL_ROLES as [Role, ...Role[]]).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuery>;

export const UserDto = z.object({
  ...zDtoBase,
  email: z.string().nullable(),
  username: z.string(),
  fullName: z.string(),
  phone: z.string().nullish(),
  role: z.nativeEnum(Role),
  status: z.nativeEnum(UserStatus),
  mustChangePassword: z.boolean(),
  lockedUntil: zDateTime.nullable().optional(),
  teacherProfile: TeacherProfile.optional(),
  studentId: zObjectId.optional(),
});
export type UserDto = z.infer<typeof UserDto>;

/** POST /users (created user + temp password shown once) */
export const CreateUserResultDto = z.object({ user: UserDto, tempPassword: z.string() });
export type CreateUserResultDto = z.infer<typeof CreateUserResultDto>;

/** POST /users/:id/reset-password */
export const ResetPasswordResultDto = z.object({ tempPassword: z.string() });
export type ResetPasswordResultDto = z.infer<typeof ResetPasswordResultDto>;

/** GET /teachers (short list for pickers) */
export const TeacherOptionDto = z.object({
  id: zObjectId,
  fullName: z.string(),
  teacherProfile: TeacherProfile.optional(),
});
export type TeacherOptionDto = z.infer<typeof TeacherOptionDto>;
