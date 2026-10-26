import { Connection } from 'mongoose';
import type { CourseDoc, Course } from '../../src/database/schemas/course.schema';
import type { Room, RoomDoc } from '../../src/database/schemas/room.schema';
import type { Lead, LeadDoc } from '../../src/database/schemas/lead.schema';
import { models, seq } from './common';
import { makeUser } from './user.factory';

export async function makeCourse(conn: Connection, p: Partial<Course> = {}): Promise<CourseDoc> {
  const n = seq();
  return models(conn).Course.create({
    code: `CRS-${n}`,
    name: `Course ${n}`,
    language: 'Tiếng Anh',
    levels: ['A1', 'A2', 'B1'],
    totalSessions: 24,
    baseFee: 3_000_000,
    ...p,
  });
}

export async function makeRoom(conn: Connection, p: Partial<Room> = {}): Promise<RoomDoc> {
  const n = seq();
  return models(conn).Room.create({ code: `R${n}`, name: `Room ${n}`, capacity: 20, ...p });
}

export async function makeLead(conn: Connection, p: Partial<Lead> = {}): Promise<LeadDoc> {
  const n = seq();
  const interestedCourseId = p.interestedCourseId ?? (await makeCourse(conn))._id;
  const createdBy = p.createdBy ?? (await makeUser(conn))._id;
  return models(conn).Lead.create({
    fullName: `Lead ${n}`,
    dob: new Date('2000-01-01T00:00:00+07:00'),
    gender: 'MALE',
    phone: `09${String(10_000_000 + n).slice(-8)}`,
    interestedCourseId,
    createdBy,
    ...p,
  });
}
