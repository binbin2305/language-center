import type { Types } from 'mongoose';
import { addVnDays, startOfVnDay, toDateOnly, type AssessmentDto, type GradeDto, type GradeHistoryEntry } from '@lc/shared';
import type { Assessment } from '../../database/schemas/assessment.schema';
import type { Grade } from '../../database/schemas/grade.schema';

type AssessmentRecord = Assessment & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

/** Gradebook lock instant: VN midnight of heldOn + gradeLockDays (D16). */
export function gradebookLockedAt(heldOn: Date, gradeLockDays: number): Date {
  return startOfVnDay(addVnDays(toDateOnly(heldOn), gradeLockDays));
}

/** Maps an assessment (document or lean object) to its DTO; derives lockedAt / isLocked (D16). */
export function toAssessmentDto(
  doc: { toObject(): unknown } | AssessmentRecord,
  settings: { gradeLockDays: number },
  now: Date,
): AssessmentDto {
  const a = ('toObject' in doc ? doc.toObject() : doc) as AssessmentRecord;
  const lockedAt = gradebookLockedAt(a.heldOn, settings.gradeLockDays);
  const unlocked = a.unlockedUntil !== null && a.unlockedUntil !== undefined && a.unlockedUntil > now;
  return {
    id: a._id.toString(),
    classId: a.classId.toString(),
    name: a.name,
    type: a.type,
    weight: a.weight,
    heldOn: toDateOnly(a.heldOn),
    confirmedAt: a.confirmedAt ? a.confirmedAt.toISOString() : null,
    unlockedUntil: a.unlockedUntil ? a.unlockedUntil.toISOString() : null,
    lockedAt: lockedAt.toISOString(),
    isLocked: now >= lockedAt && !unlocked,
    ...(a.createdBy ? { createdBy: a.createdBy.toString() } : {}),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

type GradeRecord = Grade & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toGradeHistory(history: Grade['history'] | undefined): GradeHistoryEntry[] {
  return (history ?? []).map((h) => ({
    fromScore: h.fromScore,
    toScore: h.toScore,
    fromComment: h.fromComment ?? null,
    toComment: h.toComment ?? null,
    reason: h.reason,
    by: h.by.toString(),
    at: h.at.toISOString(),
  }));
}

/** Maps a grade (document or lean object) to its DTO; student info is optional decoration. */
export function toGradeDto(
  doc: { toObject(): unknown } | GradeRecord,
  student?: { code?: string; fullName?: string } | null,
): GradeDto {
  const g = ('toObject' in doc ? doc.toObject() : doc) as GradeRecord;
  return {
    id: g._id.toString(),
    assessmentId: g.assessmentId.toString(),
    classId: g.classId.toString(),
    studentId: g.studentId.toString(),
    enrollmentId: g.enrollmentId.toString(),
    score: g.score,
    comment: g.comment ?? null,
    isDraft: g.isDraft,
    history: toGradeHistory(g.history),
    studentName: student?.fullName,
    studentCode: student?.code,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}
