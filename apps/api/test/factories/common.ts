import { Connection } from 'mongoose';
import { Models } from '../../src/database/models';
import type { Assessment } from '../../src/database/schemas/assessment.schema';
import type { Attendance } from '../../src/database/schemas/attendance.schema';
import type { Class } from '../../src/database/schemas/class.schema';
import type { Course } from '../../src/database/schemas/course.schema';
import type { Enrollment } from '../../src/database/schemas/enrollment.schema';
import type { Grade } from '../../src/database/schemas/grade.schema';
import type { Invoice } from '../../src/database/schemas/invoice.schema';
import type { Lead } from '../../src/database/schemas/lead.schema';
import type { Payment } from '../../src/database/schemas/payment.schema';
import type { PlacementTest } from '../../src/database/schemas/placement-test.schema';
import type { Room } from '../../src/database/schemas/room.schema';
import type { Session } from '../../src/database/schemas/session.schema';
import type { Student } from '../../src/database/schemas/student.schema';
import type { User } from '../../src/database/schemas/user.schema';

/** Module-level counter used to generate unique codes, phones and emails. */
let counter = 0;
export function seq(): number {
  return ++counter;
}

export function models(conn: Connection) {
  return {
    User: conn.model<User>(Models.User),
    Course: conn.model<Course>(Models.Course),
    Room: conn.model<Room>(Models.Room),
    Lead: conn.model<Lead>(Models.Lead),
    Student: conn.model<Student>(Models.Student),
    Enrollment: conn.model<Enrollment>(Models.Enrollment),
    PlacementTest: conn.model<PlacementTest>(Models.PlacementTest),
    Class: conn.model<Class>(Models.Class),
    Session: conn.model<Session>(Models.Session),
    Attendance: conn.model<Attendance>(Models.Attendance),
    Assessment: conn.model<Assessment>(Models.Assessment),
    Grade: conn.model<Grade>(Models.Grade),
    Invoice: conn.model<Invoice>(Models.Invoice),
    Payment: conn.model<Payment>(Models.Payment),
  };
}
