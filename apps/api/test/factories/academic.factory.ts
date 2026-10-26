import { Connection } from 'mongoose';
import { EnrollmentStatus } from '@lc/shared';
import type { Class, ClassDoc } from '../../src/database/schemas/class.schema';
import type { Enrollment, EnrollmentDoc } from '../../src/database/schemas/enrollment.schema';
import type { PlacementTest, PlacementTestDoc } from '../../src/database/schemas/placement-test.schema';
import type { Session, SessionDoc } from '../../src/database/schemas/session.schema';
import { makeCourse, makeRoom } from './catalog.factory';
import { models, seq } from './common';
import { makeStudent } from './student.factory';
import { makeTeacher } from './user.factory';

export async function makeClass(conn: Connection, p: Partial<Class> = {}): Promise<ClassDoc> {
  const n = seq();
  const courseId = p.courseId ?? (await makeCourse(conn))._id;
  const teacherId = p.teacherId ?? (await makeTeacher(conn))._id;
  return models(conn).Class.create({
    code: `F-CLS-${n}`,
    name: `Class ${n}`,
    courseId,
    level: 'A1',
    teacherId,
    maxCapacity: 20,
    startDate: new Date('2026-01-05T00:00:00+07:00'),
    endDate: new Date('2026-04-05T00:00:00+07:00'),
    ...p,
  });
}

export async function makeEnrollment(conn: Connection, p: Partial<Enrollment> = {}): Promise<EnrollmentDoc> {
  const studentId = p.studentId ?? (await makeStudent(conn))._id;
  const courseId = p.courseId ?? (await makeCourse(conn))._id;
  return models(conn).Enrollment.create({
    studentId,
    courseId,
    status: EnrollmentStatus.PENDING_PLACEMENT,
    ...p,
  });
}

export async function makePlacementTest(conn: Connection, p: Partial<PlacementTest> = {}): Promise<PlacementTestDoc> {
  const courseId = p.courseId ?? (await makeCourse(conn))._id;
  const roomId = p.roomId ?? (await makeRoom(conn))._id;
  const teacherId = p.teacherId ?? (await makeTeacher(conn))._id;
  return models(conn).PlacementTest.create({
    courseId,
    roomId,
    teacherId,
    startAt: new Date('2026-01-10T02:00:00Z'),
    endAt: new Date('2026-01-10T04:00:00Z'),
    ...p,
  });
}

export async function makeSession(conn: Connection, p: Partial<Session> = {}): Promise<SessionDoc> {
  const cls = p.classId ? await models(conn).Class.findById(p.classId) : await makeClass(conn);
  if (!cls) throw new Error('makeSession: class not found');
  const roomId = p.roomId ?? cls.defaultRoomId ?? (await makeRoom(conn))._id;
  return models(conn).Session.create({
    classId: cls._id,
    roomId,
    teacherId: cls.teacherId,
    startAt: new Date('2026-01-06T02:00:00Z'),
    endAt: new Date('2026-01-06T04:00:00Z'),
    ...p,
  });
}
