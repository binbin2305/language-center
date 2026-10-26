import { z } from 'zod';
import { EnrollmentStatus } from '../enums';
import { zDateTime, zDtoBase, zObjectId, zPagination, zReason } from './common';

/** POST /enrollments — studentId required for staff, omitted for STUDENT (self). */
export const CreateEnrollmentInput = z.object({
  studentId: zObjectId.optional(),
  courseId: zObjectId,
});
export type CreateEnrollmentInput = z.infer<typeof CreateEnrollmentInput>;

export const ListEnrollmentsQuery = zPagination.extend({
  status: z.nativeEnum(EnrollmentStatus).optional(),
  courseId: zObjectId.optional(),
  classId: zObjectId.optional(),
  studentId: zObjectId.optional(),
});
export type ListEnrollmentsQuery = z.infer<typeof ListEnrollmentsQuery>;

/** GET /enrollments/waiting */
export const ListWaitingEnrollmentsQuery = zPagination.extend({
  courseId: zObjectId.optional(),
});
export type ListWaitingEnrollmentsQuery = z.infer<typeof ListWaitingEnrollmentsQuery>;

/** PATCH /enrollments/:id/course */
export const ChangeEnrollmentCourseInput = z.object({ courseId: zObjectId }).strict();
export type ChangeEnrollmentCourseInput = z.infer<typeof ChangeEnrollmentCourseInput>;

/** POST /enrollments/:id/skip-placement */
export const SkipPlacementInput = z.object({
  level: z.string().trim().min(1).max(50),
  reason: zReason,
});
export type SkipPlacementInput = z.infer<typeof SkipPlacementInput>;

/** POST /enrollments/:id/assign */
export const AssignClassInput = z.object({
  classId: zObjectId,
  overrideReason: z.string().trim().min(5).max(500).optional(),
});
export type AssignClassInput = z.infer<typeof AssignClassInput>;

/** POST /enrollments/:id/transfer */
export const TransferEnrollmentInput = z.object({
  toClassId: zObjectId,
  reason: zReason,
});
export type TransferEnrollmentInput = z.infer<typeof TransferEnrollmentInput>;

/** POST /enrollments/:id/withdraw */
export const WithdrawEnrollmentInput = z.object({
  status: z.enum([EnrollmentStatus.CANCELLED, EnrollmentStatus.RESERVED]),
  reason: zReason,
});
export type WithdrawEnrollmentInput = z.infer<typeof WithdrawEnrollmentInput>;

const ReasonStamp = z.object({ reason: z.string(), by: zObjectId, at: zDateTime });

export const EnrollmentHistoryEntry = z.object({
  from: z.nativeEnum(EnrollmentStatus).nullable(),
  to: z.nativeEnum(EnrollmentStatus),
  at: zDateTime,
  by: zObjectId.nullable(),
  reason: z.string().optional(),
});
export type EnrollmentHistoryEntry = z.infer<typeof EnrollmentHistoryEntry>;

export const EnrollmentDto = z.object({
  ...zDtoBase,
  studentId: zObjectId,
  courseId: zObjectId,
  classId: zObjectId.nullable(),
  status: z.nativeEnum(EnrollmentStatus),
  placementLevel: z.string().nullable(),
  placementSkipped: ReasonStamp.nullable(),
  levelOverride: ReasonStamp.nullable(),
  waitingSince: zDateTime.nullable(),
  enrolledAt: zDateTime.nullable(),
  confirmedAt: zDateTime.nullable(),
  transferredToId: zObjectId.nullable(),
  transferredFromId: zObjectId.nullable(),
  invoiceId: zObjectId.nullable(),
  history: z.array(EnrollmentHistoryEntry),
  // Optional expanded labels for list screens
  studentName: z.string().optional(),
  studentCode: z.string().optional(),
  courseName: z.string().optional(),
  className: z.string().optional(),
});
export type EnrollmentDto = z.infer<typeof EnrollmentDto>;

/** GET /enrollments/waiting rows — with waiting days. */
export const WaitingEnrollmentDto = EnrollmentDto.extend({ waitingDays: z.number().int().nonnegative() });
export type WaitingEnrollmentDto = z.infer<typeof WaitingEnrollmentDto>;
