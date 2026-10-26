import { z } from 'zod';
import { Role } from '../enums';
import { zEmail, zObjectId } from './common';

export const LoginInput = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const zPassword = z.string().min(8).max(100);

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: zPassword,
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const TeacherProfile = z.object({
  languages: z.array(z.string().trim().min(1)),
  levels: z.array(z.string().trim().min(1)),
  specialization: z.string().trim().max(200).optional(),
});
export type TeacherProfile = z.infer<typeof TeacherProfile>;

/** GET /auth/me and `user` in login/refresh/change-password (ruling R3). */
export const MeDto = z.object({
  id: zObjectId,
  username: z.string(),
  fullName: z.string(),
  role: z.nativeEnum(Role),
  email: zEmail.nullish(),
  studentId: zObjectId.optional(),
  teacherProfile: TeacherProfile.optional(),
  mustChangePassword: z.boolean(),
});
export type MeDto = z.infer<typeof MeDto>;

/** login / refresh / change-password data (ruling R2). */
export const AuthResultDto = z.object({ accessToken: z.string().min(1), user: MeDto });
export type AuthResultDto = z.infer<typeof AuthResultDto>;
