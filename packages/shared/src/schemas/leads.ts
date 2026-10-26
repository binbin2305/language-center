import { z } from 'zod';
import { Gender, LeadStatus } from '../enums';
import { zBoolQuery, zDateOnly, zDtoBase, zEmail, zObjectId, zPagination, zReason, zVnPhone } from './common';
import { StudentDto } from './students';

export const CreateLeadInput = z.object({
  fullName: z.string().trim().min(2).max(100),
  dob: zDateOnly,
  gender: z.nativeEnum(Gender),
  phone: zVnPhone,
  email: zEmail.nullish(),
  address: z.string().trim().max(300).optional(),
  interestedCourseId: zObjectId,
  note: z.string().trim().max(1000).optional(),
});
export type CreateLeadInput = z.infer<typeof CreateLeadInput>;

/** POST /leads?force=true */
export const CreateLeadQuery = z.object({ force: zBoolQuery.default(false) });
export type CreateLeadQuery = z.infer<typeof CreateLeadQuery>;

export const UpdateLeadInput = CreateLeadInput.partial().strict();
export type UpdateLeadInput = z.infer<typeof UpdateLeadInput>;

/** POST /leads/:id/cancel */
export const CancelLeadInput = z.object({ reason: zReason.optional() });
export type CancelLeadInput = z.infer<typeof CancelLeadInput>;

/** POST /leads/:id/convert?force=true */
export const ConvertLeadQuery = z.object({ force: zBoolQuery.default(false) });
export type ConvertLeadQuery = z.infer<typeof ConvertLeadQuery>;

export const ListLeadsQuery = zPagination.extend({
  status: z.nativeEnum(LeadStatus).optional(),
  courseId: zObjectId.optional(),
  from: zDateOnly.optional(),
  to: zDateOnly.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListLeadsQuery = z.infer<typeof ListLeadsQuery>;

export const LeadDto = z.object({
  ...zDtoBase,
  fullName: z.string(),
  dob: zDateOnly,
  gender: z.nativeEnum(Gender),
  phone: z.string(),
  email: z.string().nullable(),
  address: z.string().nullish(),
  interestedCourseId: zObjectId,
  note: z.string().nullish(),
  status: z.nativeEnum(LeadStatus),
  studentId: zObjectId.nullable(),
  createdBy: zObjectId.optional(),
});
export type LeadDto = z.infer<typeof LeadDto>;

/** POST /leads/:id/convert → { student, tempPassword } (+ enrollment created) */
export const ConvertLeadResultDto = z.object({
  student: StudentDto,
  tempPassword: z.string(),
  enrollmentId: zObjectId.optional(),
});
export type ConvertLeadResultDto = z.infer<typeof ConvertLeadResultDto>;
