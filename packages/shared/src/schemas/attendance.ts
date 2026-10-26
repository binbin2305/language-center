import { z } from 'zod';
import { AttendanceStatus } from '../enums';
import { zDateOnly, zDateTime, zDtoBase, zObjectId, zPagination } from './common';

const note = z.string().trim().max(500);

/** PUT /sessions/:id/attendance — first time, must be complete (ATTENDANCE_INCOMPLETE is a service rule). */
export const TakeAttendanceInput = z.object({
  records: z
    .array(z.object({ studentId: zObjectId, status: z.nativeEnum(AttendanceStatus), note: note.optional() }))
    .min(1),
  sessionNote: z.string().trim().max(1000).optional(),
});
export type TakeAttendanceInput = z.infer<typeof TakeAttendanceInput>;

/** PATCH /sessions/:id/attendance — edit; reason required by context (service). */
export const UpdateAttendanceInput = z.object({
  records: z
    .array(z.object({ studentId: zObjectId, status: z.nativeEnum(AttendanceStatus), reason: note.optional() }))
    .min(1),
});
export type UpdateAttendanceInput = z.infer<typeof UpdateAttendanceInput>;

export const ListAttendanceQuery = zPagination.extend({
  from: zDateOnly.optional(),
  to: zDateOnly.optional(),
  classId: zObjectId.optional(),
  studentId: zObjectId.optional(),
});
export type ListAttendanceQuery = z.infer<typeof ListAttendanceQuery>;

export const AttendanceSummaryQuery = z.object({
  groupBy: z.enum(['student', 'class']),
  from: zDateOnly.optional(),
  to: zDateOnly.optional(),
  classId: zObjectId.optional(),
  studentId: zObjectId.optional(),
});
export type AttendanceSummaryQuery = z.infer<typeof AttendanceSummaryQuery>;

export const AttendanceHistoryEntry = z.object({
  from: z.nativeEnum(AttendanceStatus).nullable(),
  to: z.nativeEnum(AttendanceStatus),
  reason: z.string().optional(),
  by: zObjectId,
  at: zDateTime,
});
export type AttendanceHistoryEntry = z.infer<typeof AttendanceHistoryEntry>;

export const AttendanceDto = z.object({
  ...zDtoBase,
  sessionId: zObjectId,
  classId: zObjectId,
  studentId: zObjectId,
  enrollmentId: zObjectId,
  status: z.nativeEnum(AttendanceStatus),
  note: z.string().nullish(),
  recordedBy: zObjectId,
  history: z.array(AttendanceHistoryEntry),
  sessionStartAt: zDateTime.optional(),
  studentName: z.string().optional(),
  classCode: z.string().optional(),
});
export type AttendanceDto = z.infer<typeof AttendanceDto>;

/** GET /sessions/:id/attendance — roster with current status (null = not recorded). */
export const SessionAttendanceDto = z.object({
  sessionId: zObjectId,
  taken: z.boolean(),
  sessionNote: z.string().nullish(),
  roster: z.array(
    z.object({
      studentId: zObjectId,
      enrollmentId: zObjectId,
      studentCode: z.string(),
      fullName: z.string(),
      status: z.nativeEnum(AttendanceStatus).nullable(),
      note: z.string().nullish(),
    }),
  ),
});
export type SessionAttendanceDto = z.infer<typeof SessionAttendanceDto>;

/** GET /attendance/summary row: counts per status + rates. */
export const AttendanceSummaryRowDto = z.object({
  key: zObjectId,
  label: z.string(),
  PRESENT: z.number().int().nonnegative(),
  LATE: z.number().int().nonnegative(),
  EXCUSED: z.number().int().nonnegative(),
  UNEXCUSED: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  attendanceRate: z.number().min(0).max(1),
  absenceRate: z.number().min(0).max(1),
});
export type AttendanceSummaryRowDto = z.infer<typeof AttendanceSummaryRowDto>;
