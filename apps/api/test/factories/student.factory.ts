import { Connection, Types } from 'mongoose';
import { Role } from '@lc/shared';
import type { Student, StudentDoc } from '../../src/database/schemas/student.schema';
import { models, seq } from './common';
import { DEFAULT_PASSWORD_HASH } from './user.factory';

export async function makeStudent(
  conn: Connection,
  p: Partial<Student> & { withUser?: boolean } = {},
): Promise<StudentDoc> {
  const { withUser, ...rest } = p;
  const n = seq();
  const _id = new Types.ObjectId();
  const code = rest.code ?? `HV1999${String(n).padStart(5, '0')}`;
  const userId = rest.userId ?? (withUser ? new Types.ObjectId() : undefined);
  const student = await models(conn).Student.create({
    _id,
    code,
    fullName: `Student ${n}`,
    dob: new Date('2005-01-01T00:00:00+07:00'),
    gender: 'FEMALE',
    phone: `09${String(20_000_000 + n).slice(-8)}`,
    ...rest,
    ...(userId ? { userId } : {}),
  });
  if (withUser && userId) {
    // STUDENT users store no email (it lives on the student).
    await models(conn).User.create({
      _id: userId,
      username: code,
      passwordHash: DEFAULT_PASSWORD_HASH,
      fullName: student.fullName,
      role: Role.STUDENT,
      studentId: student._id,
    });
  }
  return student;
}
