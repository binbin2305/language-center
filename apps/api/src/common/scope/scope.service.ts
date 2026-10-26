import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EnrollmentStatus } from '@lc/shared';
import { Models } from '../../database/models';
import { Class } from '../../database/schemas/class.schema';
import { Enrollment } from '../../database/schemas/enrollment.schema';

function dedupe(list: Array<Types.ObjectId | null | undefined>): Types.ObjectId[] {
  const map = new Map<string, Types.ObjectId>();
  for (const id of list) if (id) map.set(String(id), id);
  return [...map.values()];
}

/** Shared data-scope definitions (ARCHITECTURE.md section 4.6). Every lane must use these. */
@Injectable()
export class ScopeService {
  constructor(
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
  ) {}

  /** Classes where the user is main or assistant teacher, any class status. */
  async teacherClassIds(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const rows = await this.classes
      .find({ $or: [{ teacherId: userId }, { assistantTeacherId: userId }] }, { _id: 1 })
      .lean();
    return dedupe(rows.map((r) => r._id));
  }

  /** Substitute teacher of the session, or any teacher of the session's class. */
  async teacherCanTakeAttendance(
    userId: Types.ObjectId,
    session: { teacherId: Types.ObjectId; classId: Types.ObjectId },
  ): Promise<boolean> {
    if (String(session.teacherId) === String(userId)) return true;
    const ids = await this.teacherClassIds(userId);
    return ids.some((id) => String(id) === String(session.classId));
  }

  /** current = ENROLLED only; history = any enrollment that has a class. */
  async studentClassIds(studentId: Types.ObjectId, mode: 'current' | 'history'): Promise<Types.ObjectId[]> {
    const filter =
      mode === 'current'
        ? { studentId, classId: { $ne: null }, status: EnrollmentStatus.ENROLLED }
        : { studentId, classId: { $ne: null } };
    const rows = await this.enrollments.find(filter, { classId: 1 }).lean();
    return dedupe(rows.map((r) => r.classId));
  }

  /** Students ENROLLED or COMPLETED in the teacher's classes. */
  async teacherStudentIds(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const classIds = await this.teacherClassIds(userId);
    if (classIds.length === 0) return [];
    const rows = await this.enrollments
      .find(
        { classId: { $in: classIds }, status: { $in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] } },
        { studentId: 1 },
      )
      .lean();
    return dedupe(rows.map((r) => r.studentId));
  }
}
