import { Types } from 'mongoose';
import type { TeacherOptionDto, UserDto } from '@lc/shared';
import type { User } from '../../database/schemas/user.schema';

export type UserLean = Omit<User, 'passwordHash'> & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

/** Never exposes passwordHash or login-throttling internals. */
export function toUserDto(u: UserLean): UserDto {
  return {
    id: u._id.toString(),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    email: u.email ?? null,
    username: u.username,
    fullName: u.fullName,
    ...(u.phone ? { phone: u.phone } : {}),
    role: u.role,
    status: u.status,
    mustChangePassword: u.mustChangePassword,
    lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
    ...(u.teacherProfile
      ? {
          teacherProfile: {
            languages: [...u.teacherProfile.languages],
            levels: [...u.teacherProfile.levels],
            ...(u.teacherProfile.specialization ? { specialization: u.teacherProfile.specialization } : {}),
          },
        }
      : {}),
    ...(u.studentId ? { studentId: u.studentId.toString() } : {}),
  };
}

export function toTeacherOptionDto(u: UserLean): TeacherOptionDto {
  const { teacherProfile } = toUserDto(u);
  return { id: u._id.toString(), fullName: u.fullName, ...(teacherProfile ? { teacherProfile } : {}) };
}
