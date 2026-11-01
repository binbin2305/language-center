import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { EnrollmentStatus } from '@lc/shared';
import { Models } from '../../database/models';
import { Class } from '../../database/schemas/class.schema';
import { Enrollment } from '../../database/schemas/enrollment.schema';

function dedupe(list: Array<Types.ObjectId | null | undefined>): Types.ObjectId[] {
  const map = new Map<string, Types.ObjectId>();
  for (const id of list) if (id) map.set(String(id), id);
  return [...map.values()];
}

/**
 * D38 (Rulings R7, R9) — profile/list scope: (ENROLLED|COMPLETED|TRANSFERRED and `classId` ∈ classes) or
 * (not CANCELLED and `classHistory` ∩ classes ≠ ∅, R22). A transferred-out row keeps `classId` = the old class;
 * a RESERVED / resumed (WAITING_CLASS, classId null) stint keeps its class in classHistory.
 * Branches use { classId, status } and { classHistory } respectively.
 */
export function teacherStudentsFilter(classIds: Types.ObjectId[]): FilterQuery<Enrollment> {
  return {
    $or: [
      { classId: { $in: classIds }, status: { $in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED, EnrollmentStatus.TRANSFERRED] } },
      { classHistory: { $in: classIds }, status: { $ne: EnrollmentStatus.CANCELLED } },
    ],
  };
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

  /** current = ENROLLED only; history (R22) = every class any enrollment was ever seated in: classId ∪ classHistory. */
  async studentClassIds(studentId: Types.ObjectId, mode: 'current' | 'history'): Promise<Types.ObjectId[]> {
    if (mode === 'current') {
      const rows = await this.enrollments
        .find({ studentId, classId: { $ne: null }, status: EnrollmentStatus.ENROLLED }, { classId: 1 })
        .lean();
      return dedupe(rows.map((r) => r.classId));
    }
    const rows = await this.enrollments
      .find({ studentId, $or: [{ classId: { $ne: null } }, { 'classHistory.0': { $exists: true } }] }, { classId: 1, classHistory: 1 })
      .lean();
    return dedupe(rows.flatMap((r) => [r.classId, ...(r.classHistory ?? [])]));
  }

  /** D38/R9: students the teacher may open (profile, /students list) — current or former students of their classes. */
  async teacherStudentIds(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const classIds = await this.teacherClassIds(userId);
    if (classIds.length === 0) return [];
    const rows = await this.enrollments.find(teacherStudentsFilter(classIds), { studentId: 1 }).lean();
    return dedupe(rows.map((r) => r.studentId));
  }

  /** R9 (FR-FEE-06 "HV lớp mình"): students ENROLLED or COMPLETED with `classId` in the teacher's classes — invoices. */
  async teacherCurrentStudentIds(userId: Types.ObjectId): Promise<Types.ObjectId[]> {
    const classIds = await this.teacherClassIds(userId);
    if (classIds.length === 0) return [];
    const rows = await this.enrollments
      .find({ classId: { $in: classIds }, status: { $in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] } }, { studentId: 1 })
      .lean();
    return dedupe(rows.map((r) => r.studentId));
  }
}
