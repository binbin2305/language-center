import { Connection } from 'mongoose';
import { Role } from '@lc/shared';
import type { User, UserDoc } from '../../src/database/schemas/user.schema';
import { models, seq } from './common';

export const DEFAULT_PASSWORD = 'Password1';
/** bcrypt hash of DEFAULT_PASSWORD at cost 4. */
export const DEFAULT_PASSWORD_HASH = '$2b$04$HOyHIQioEf8LMVq4PeGHQexuQ53kwpeOdFlBr4URI/J7MNq9cqcju';

export async function makeUser(conn: Connection, p: Partial<User> = {}): Promise<UserDoc> {
  const n = seq();
  const role = p.role ?? Role.ADMIN;
  const isStudent = role === Role.STUDENT;
  const email = isStudent ? undefined : (p.email ?? `user${n}@example.com`);
  return models(conn).User.create({
    username: isStudent ? `HV-U${n}` : email,
    passwordHash: DEFAULT_PASSWORD_HASH,
    fullName: `User ${n}`,
    role,
    ...(role === Role.TEACHER ? { teacherProfile: { languages: ['Tiếng Anh'], levels: ['A1', 'A2'] } } : {}),
    ...p,
    // STUDENT accounts never store an email.
    email: isStudent ? undefined : email,
  });
}

export const makeTeacher = (conn: Connection, p: Partial<User> = {}) => makeUser(conn, { ...p, role: Role.TEACHER });
