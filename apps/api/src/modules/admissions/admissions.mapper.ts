import { Types } from 'mongoose';
import { EnrollmentDto, LeadDto, StudentBriefDto, StudentDto, toDateOnly } from '@lc/shared';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { Student } from '../../database/schemas/student.schema';
import type { Lead } from '../../database/schemas/lead.schema';

export type LeadLean = Lead & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toLeadDto(l: LeadLean, createdByName?: string): LeadDto {
  return {
    id: l._id.toString(),
    fullName: l.fullName,
    dob: toDateOnly(l.dob),
    gender: l.gender,
    phone: l.phone,
    email: l.email ?? null,
    address: l.address ?? null,
    interestedCourseId: l.interestedCourseId.toString(),
    note: l.note ?? null,
    status: l.status,
    studentId: l.studentId?.toString() ?? null,
    createdBy: l.createdBy?.toString(),
    ...(createdByName ? { createdByName } : {}),
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export type StudentLean = Student & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toStudentDto(s: StudentLean): StudentDto {
  return {
    id: s._id.toString(),
    code: s.code,
    fullName: s.fullName,
    dob: toDateOnly(s.dob),
    gender: s.gender,
    phone: s.phone,
    email: s.email ?? null,
    address: s.address ?? null,
    status: s.status,
    leadId: s.leadId?.toString() ?? null,
    userId: s.userId?.toString() ?? null,
    documents: (s.documents ?? []).map((d) => ({
      id: d._id.toString(),
      fileName: d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      uploadedAt: d.uploadedAt.toISOString(),
      uploadedBy: d.uploadedBy.toString(),
    })),
    note: s.note ?? null,
    currentClasses: [], // D24: filled by StudentsService (L-01)
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toStudentBriefDto(s: StudentLean): StudentBriefDto {
  return { id: s._id.toString(), code: s.code, fullName: s.fullName, dob: toDateOnly(s.dob), phone: s.phone, status: s.status, currentClasses: [] };
}

export type EnrollmentLean = Enrollment & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const oid = (v: Types.ObjectId | null | undefined) => (v ? v.toString() : null);
const stamp = (s: { reason: string; by: Types.ObjectId; at: Date } | null | undefined) =>
  s ? { reason: s.reason, by: s.by.toString(), at: s.at.toISOString() } : null;

export function toEnrollmentDto(e: EnrollmentLean): EnrollmentDto {
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
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
