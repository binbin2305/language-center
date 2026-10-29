import { z } from 'zod';
import { ClassStatus } from '../enums';
import { zBoolQuery, zDateOnly, zDtoBase, zObjectId, zPagination } from './common';

export const CreateClassInput = z.object({
  code: z.string().trim().min(1).max(30).toUpperCase(),
  name: z.string().trim().min(1).max(150),
  courseId: zObjectId,
  level: z.string().trim().min(1).max(50),
  teacherId: zObjectId,
  assistantTeacherId: zObjectId.nullish(),
  defaultRoomId: zObjectId.nullish(),
  maxCapacity: z.number().int().min(1).max(100),
  startDate: zDateOnly,
  endDate: zDateOnly,
  status: z.nativeEnum(ClassStatus).optional(),
});
export type CreateClassInput = z.infer<typeof CreateClassInput>;

/** PATCH /classes/:id — currentSize is never accepted; code immutable. */
export const UpdateClassInput = CreateClassInput.omit({ code: true }).partial().strict();
export type UpdateClassInput = z.infer<typeof UpdateClassInput>;

export const ListClassesQuery = zPagination.extend({
  courseId: zObjectId.optional(),
  level: z.string().trim().optional(),
  status: z.nativeEnum(ClassStatus).optional(),
  hasSeat: zBoolQuery.optional(),
  /** Only PLANNED|ONGOING classes (the ones sessions can be scheduled for), full or not. */
  open: zBoolQuery.optional(),
  /** CL-03: only meaningful for STUDENT — include classes the student left or completed. */
  includePast: zBoolQuery.optional(),
  teacherId: zObjectId.optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListClassesQuery = z.infer<typeof ListClassesQuery>;

/** CLASS_HAS_DEPENDENCIES details.reasons (D9) */
export const ClassDependencyReason = z.enum([
  'ACTIVE_STUDENTS',
  'ENROLLMENT_HISTORY',
  'SESSIONS',
  'GRADES',
  'INVOICES',
]);
export type ClassDependencyReason = z.infer<typeof ClassDependencyReason>;

/** GET /classes/:id/students */
export const ClassRosterQuery = zPagination.extend({});
export type ClassRosterQuery = z.infer<typeof ClassRosterQuery>;

export const ClassDto = z.object({
  ...zDtoBase,
  code: z.string(),
  name: z.string(),
  courseId: zObjectId,
  level: z.string(),
  teacherId: zObjectId,
  assistantTeacherId: zObjectId.nullish(),
  defaultRoomId: zObjectId.nullish(),
  maxCapacity: z.number().int(),
  currentSize: z.number().int().nonnegative(),
  startDate: zDateOnly,
  endDate: zDateOnly,
  status: z.nativeEnum(ClassStatus),
  courseName: z.string().optional(),
  teacherName: z.string().optional(),
  /** Name of `defaultRoomId`, for the class header (all roles; GET /rooms is M, S only). */
  defaultRoomName: z.string().nullish(),
});
export type ClassDto = z.infer<typeof ClassDto>;

/** GET /classes/:id/students row, with absence warning flag. */
export const ClassStudentDto = z.object({
  studentId: zObjectId,
  enrollmentId: zObjectId,
  studentCode: z.string(),
  fullName: z.string(),
  absenceRate: z.number().min(0),
  warning: z.boolean(),
});
export type ClassStudentDto = z.infer<typeof ClassStudentDto>;
