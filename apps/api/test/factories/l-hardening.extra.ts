import { Connection, Types } from 'mongoose';
import { EnrollmentStatus, NotificationType, PlacementStatus } from '@lc/shared';
import { Models } from '../../src/database/models';
import type { Notification } from '../../src/database/schemas/notification.schema';
import { makeClass, makeEnrollment, makePlacementTest, makeSession } from './academic.factory';
import { makeAssessment, makeAttendance, makeGrade } from './assessment.factory';
import { makeInvoice, makePayment } from './billing.factory';
import { makeCourse, makeLead, makeRoom } from './catalog.factory';
import { models } from './common';
import { makeStudent } from './student.factory';

/**
 * One STUDENT account with one of every resource a student can own (H-01B, D35).
 * `courseId`, `roomId`, `leadId` are extra (not student-owned / staff-only) so every GET :param route has a real id.
 */
export interface StudentWorld {
  token: string;
  studentId: string;
  userId: string;
  enrollmentId: string;
  classId: string;
  sessionId: string;
  assessmentId: string;
  invoiceId: string;
  paymentId: string;
  placementTestId: string;
  documentId: string;
  notificationId: string;
  courseId: string;
  roomId: string;
  leadId: string;
}

/** Logs a username in with DEFAULT_PASSWORD and returns the access token. */
export type LoginFn = (username: string) => Promise<string>;

async function seedStudentWorld(conn: Connection, login: LoginFn): Promise<StudentWorld> {
  const m = models(conn);
  const course = await makeCourse(conn);
  const room = await makeRoom(conn);
  const lead = await makeLead(conn, { interestedCourseId: course._id });
  const student = await makeStudent(conn, { withUser: true, leadId: lead._id });
  const cls = await makeClass(conn, { courseId: course._id, defaultRoomId: room._id });
  const enrollment = await makeEnrollment(conn, {
    studentId: student._id,
    courseId: course._id,
    classId: cls._id,
    status: EnrollmentStatus.ENROLLED,
  });
  const session = await makeSession(conn, { classId: cls._id, roomId: room._id });
  await makeAttendance(conn, { sessionId: session._id, studentId: student._id, enrollmentId: enrollment._id });
  const assessment = await makeAssessment(conn, { classId: cls._id });
  await makeGrade(conn, { assessmentId: assessment._id, studentId: student._id, enrollmentId: enrollment._id, isDraft: false });
  const invoice = await makeInvoice(conn, { studentId: student._id, courseId: course._id, enrollmentId: enrollment._id });
  const payment = await makePayment(conn, { invoiceId: invoice._id });
  const placement = await makePlacementTest(conn, {
    courseId: course._id,
    roomId: room._id,
    status: PlacementStatus.SCHEDULED,
    candidates: [
      { enrollmentId: enrollment._id, studentId: student._id, score: null, level: null, gradedAt: null, gradedBy: null },
    ],
  });
  const documentId = new Types.ObjectId();
  await m.Student.updateOne(
    { _id: student._id },
    {
      $push: {
        documents: {
          _id: documentId,
          fileName: 'cccd.pdf',
          mimeType: 'application/pdf',
          size: 10,
          path: `security/${documentId.toHexString()}.pdf`,
          uploadedAt: new Date('2026-01-05T02:00:00Z'),
          uploadedBy: new Types.ObjectId(),
        },
      },
    },
  );
  const notification = await conn.model<Notification>(Models.Notification).create({
    userId: student.userId,
    type: NotificationType.SESSION_CREATED,
    title: 'Buổi học mới',
    body: `Lớp ${cls.code}`,
  });

  return {
    token: await login(student.code),
    studentId: student._id.toHexString(),
    userId: String(student.userId),
    enrollmentId: enrollment._id.toHexString(),
    classId: cls._id.toHexString(),
    sessionId: session._id.toHexString(),
    assessmentId: assessment._id.toHexString(),
    invoiceId: invoice._id.toHexString(),
    paymentId: payment._id.toHexString(),
    placementTestId: placement._id.toHexString(),
    documentId: documentId.toHexString(),
    notificationId: notification._id.toHexString(),
    courseId: course._id.toHexString(),
    roomId: room._id.toHexString(),
    leadId: lead._id.toHexString(),
  };
}

/**
 * Two students A and B in two different classes (different courses, teachers, rooms), each owning
 * every resource. `login` turns a STUDENT username (the student code) into a real access token.
 */
export async function seedTwoStudents(conn: Connection, login: LoginFn): Promise<{ a: StudentWorld; b: StudentWorld }> {
  const a = await seedStudentWorld(conn, login);
  const b = await seedStudentWorld(conn, login);
  if (a.classId === b.classId) throw new Error('seedTwoStudents: A and B must be in different classes');
  return { a, b };
}
