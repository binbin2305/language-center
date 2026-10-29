import { Types } from 'mongoose';
import { LeadDto, StudentDto, toDateOnly } from '@lc/shared';
import type { Student } from '../../database/schemas/student.schema';
import type { Lead } from '../../database/schemas/lead.schema';

export type LeadLean = Lead & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toLeadDto(l: LeadLean): LeadDto {
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
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
