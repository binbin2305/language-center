import { Types } from 'mongoose';
import { EnrollmentDto } from '@lc/shared';
import type { Enrollment } from '../../database/schemas/enrollment.schema';

export type EnrollmentLean = Enrollment & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export interface EnrollmentLabels {
  studentName?: string;
  studentCode?: string;
  courseName?: string;
  className?: string;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const oid = (v: Types.ObjectId | null | undefined) => (v ? v.toString() : null);
const stamp = (s: Enrollment['placementSkipped']) =>
  s ? { reason: s.reason, by: s.by.toString(), at: s.at.toISOString() } : null;

export function toEnrollmentDto(e: EnrollmentLean, labels: EnrollmentLabels = {}): EnrollmentDto {
  return {
    id: e._id.toString(),
    studentId: e.studentId.toString(),
    courseId: e.courseId.toString(),
    classId: oid(e.classId),
    status: e.status,
    placementLevel: e.placementLevel ?? null,
    placementSkipped: stamp(e.placementSkipped),
    levelOverride: stamp(e.levelOverride),
    waitingSince: iso(e.waitingSince),
    enrolledAt: iso(e.enrolledAt),
    confirmedAt: iso(e.confirmedAt),
    transferredToId: oid(e.transferredToId),
    transferredFromId: oid(e.transferredFromId),
    invoiceId: oid(e.invoiceId),
    history: (e.history ?? []).map((h) => ({
      from: h.from ?? null,
      to: h.to,
      at: h.at.toISOString(),
      by: oid(h.by),
      ...(h.reason ? { reason: h.reason } : {}),
    })),
    ...(labels.studentName !== undefined ? { studentName: labels.studentName } : {}),
    ...(labels.studentCode !== undefined ? { studentCode: labels.studentCode } : {}),
    ...(labels.courseName !== undefined ? { courseName: labels.courseName } : {}),
    ...(labels.className !== undefined ? { className: labels.className } : {}),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
