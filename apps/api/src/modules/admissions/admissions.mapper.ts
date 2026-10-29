import { Types } from 'mongoose';
import { LeadDto, toDateOnly } from '@lc/shared';
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
