import { z } from 'zod';
import { Gender, StudentStatus } from '../enums';
import { zDateOnly, zDateTime, zDtoBase, zEmail, zMoney, zObjectId, zPagination, zVnPhone } from './common';
import { EnrollmentDto } from './enrollments';
import { DuplicateMatchDto } from './duplicates';

export const StudentDocumentDto = z.object({
  id: zObjectId,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  uploadedAt: zDateTime,
  uploadedBy: zObjectId,
});
export type StudentDocumentDto = z.infer<typeof StudentDocumentDto>;

export const StudentDto = z.object({
  ...zDtoBase,
  code: z.string(),
  fullName: z.string(),
  dob: zDateOnly,
  gender: z.nativeEnum(Gender),
  phone: z.string(),
  email: z.string().nullable(),
  address: z.string().nullish(),
  status: z.nativeEnum(StudentStatus),
  leadId: zObjectId.nullable().optional(),
  userId: zObjectId.nullable().optional(),
  documents: z.array(StudentDocumentDto),
  note: z.string().nullish(),
});
export type StudentDto = z.infer<typeof StudentDto>;

/** GET /students/:id — profile + enrollments + summary. Teachers get the reduced form (StudentBriefDto). */
export const StudentDetailDto = StudentDto.extend({
  enrollments: z.array(EnrollmentDto),
  summary: z.object({
    attendanceRate: z.number().nullable(),
    averageScore: z.number().nullable(),
    outstandingBalance: zMoney,
  }),
});
export type StudentDetailDto = z.infer<typeof StudentDetailDto>;

/** Reduced student fields for TEACHER scope. */
export const StudentBriefDto = z.object({
  id: zObjectId,
  code: z.string(),
  fullName: z.string(),
  dob: zDateOnly,
  phone: z.string(),
  status: z.nativeEnum(StudentStatus),
});
export type StudentBriefDto = z.infer<typeof StudentBriefDto>;

/** GET /students/:id for TEACHER: brief fields + enrollments in the teacher's own classes. */
export const StudentTeacherViewDto = StudentBriefDto.extend({ enrollments: z.array(EnrollmentDto) });
export type StudentTeacherViewDto = z.infer<typeof StudentTeacherViewDto>;

export const ListStudentsQuery = zPagination.extend({
  q: z.string().trim().max(100).optional(),
  status: z.nativeEnum(StudentStatus).optional(),
  classId: zObjectId.optional(),
  courseId: zObjectId.optional(),
});
export type ListStudentsQuery = z.infer<typeof ListStudentsQuery>;

/** PATCH /students/:id (M,S) */
export const UpdateStudentInput = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    dob: zDateOnly,
    gender: z.nativeEnum(Gender),
    phone: zVnPhone,
    email: zEmail.nullable(),
    address: z.string().trim().max(300),
    status: z.nativeEnum(StudentStatus),
    note: z.string().trim().max(1000),
  })
  .partial()
  .strict();
export type UpdateStudentInput = z.infer<typeof UpdateStudentInput>;

/** PATCH /students/me/contact (H) — only phone, email, address. */
export const UpdateStudentContactInput = z
  .object({
    phone: zVnPhone,
    email: zEmail.nullable(),
    address: z.string().trim().max(300),
  })
  .partial()
  .strict();
export type UpdateStudentContactInput = z.infer<typeof UpdateStudentContactInput>;

/** PATCH /students/:id and /students/me/contact result; warnings are non-blocking (D2). */
export const UpdateStudentResultDto = z.object({
  student: StudentDto,
  warnings: z.object({ duplicates: z.array(DuplicateMatchDto) }).optional(),
});
export type UpdateStudentResultDto = z.infer<typeof UpdateStudentResultDto>;

export const StudentAuditQuery = zPagination;
export type StudentAuditQuery = z.infer<typeof StudentAuditQuery>;

/** audit_logs row (GET /students/:id/audit) */
export const AuditLogDto = z.object({
  id: zObjectId,
  actorId: zObjectId,
  actorRole: z.string(),
  action: z.enum(['create', 'update', 'delete', 'status']),
  entity: z.string(),
  entityId: zObjectId,
  before: z.unknown(),
  after: z.unknown(),
  at: zDateTime,
});
export type AuditLogDto = z.infer<typeof AuditLogDto>;
