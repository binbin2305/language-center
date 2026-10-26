import { Connection } from 'mongoose';
import { AttendanceStatus, AssessmentType } from '@lc/shared';
import type { Assessment, AssessmentDoc } from '../../src/database/schemas/assessment.schema';
import type { Attendance, AttendanceDoc } from '../../src/database/schemas/attendance.schema';
import type { Grade, GradeDoc } from '../../src/database/schemas/grade.schema';
import { makeClass, makeEnrollment, makeSession } from './academic.factory';
import { models, seq } from './common';
import { makeStudent } from './student.factory';

export async function makeAttendance(conn: Connection, p: Partial<Attendance> = {}): Promise<AttendanceDoc> {
  const session = p.sessionId
    ? await models(conn).Session.findById(p.sessionId)
    : await makeSession(conn);
  if (!session) throw new Error('makeAttendance: session not found');
  const studentId = p.studentId ?? (await makeStudent(conn))._id;
  const enrollmentId =
    p.enrollmentId ??
    (await makeEnrollment(conn, { studentId, classId: session.classId, status: 'ENROLLED' }))._id;
  return models(conn).Attendance.create({
    sessionId: session._id,
    classId: session.classId,
    studentId,
    enrollmentId,
    status: AttendanceStatus.PRESENT,
    ...p,
  });
}

export async function makeAssessment(conn: Connection, p: Partial<Assessment> = {}): Promise<AssessmentDoc> {
  const classId = p.classId ?? (await makeClass(conn))._id;
  return models(conn).Assessment.create({
    classId,
    name: `Assessment ${seq()}`,
    type: AssessmentType.QUIZ,
    weight: 10,
    heldOn: new Date('2026-02-01T00:00:00+07:00'),
    ...p,
  });
}

export async function makeGrade(conn: Connection, p: Partial<Grade> = {}): Promise<GradeDoc> {
  const assessment = p.assessmentId
    ? await models(conn).Assessment.findById(p.assessmentId)
    : await makeAssessment(conn);
  if (!assessment) throw new Error('makeGrade: assessment not found');
  const studentId = p.studentId ?? (await makeStudent(conn))._id;
  const enrollmentId =
    p.enrollmentId ??
    (await makeEnrollment(conn, { studentId, classId: assessment.classId, status: 'ENROLLED' }))._id;
  return models(conn).Grade.create({
    assessmentId: assessment._id,
    classId: assessment.classId,
    studentId,
    enrollmentId,
    score: 8,
    ...p,
  });
}
