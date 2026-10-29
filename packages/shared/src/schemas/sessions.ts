import { z } from 'zod';
import { SessionStatus } from '../enums';
import { zDateOnly, zDateTime, zDtoBase, zObjectId, zReason, zTimeHHmm, zWeekday } from './common';

/** GET /sessions — from/to required (max 92 days is a service rule). */
export const ListSessionsQuery = z.object({
  from: zDateOnly,
  to: zDateOnly,
  classId: zObjectId.optional(),
  teacherId: zObjectId.optional(),
  roomId: zObjectId.optional(),
});
export type ListSessionsQuery = z.infer<typeof ListSessionsQuery>;

/** POST /sessions (single session) */
export const CreateSessionInput = z.object({
  classId: zObjectId,
  roomId: zObjectId,
  teacherId: zObjectId,
  startAt: zDateTime,
  endAt: zDateTime,
});
export type CreateSessionInput = z.infer<typeof CreateSessionInput>;

/** POST /sessions/bulk. weekdays: 1=Monday .. 7=Sunday (ISO). */
export const BulkCreateSessionsInput = z.object({
  classId: zObjectId,
  roomId: zObjectId,
  teacherId: zObjectId,
  weekdays: z.array(zWeekday).min(1).max(7),
  startTime: zTimeHHmm,
  endTime: zTimeHHmm,
  fromDate: zDateOnly,
  toDate: zDateOnly,
});
export type BulkCreateSessionsInput = z.infer<typeof BulkCreateSessionsInput>;

/** POST /sessions/check-conflicts (dry-run). excludeSessionId for edits. */
export const CheckConflictsInput = z.object({
  roomId: zObjectId,
  teacherId: zObjectId,
  startAt: zDateTime,
  endAt: zDateTime,
  classId: zObjectId.optional(),
  excludeSessionId: zObjectId.optional(),
});
export type CheckConflictsInput = z.infer<typeof CheckConflictsInput>;

export const UpdateSessionInput = z
  .object({
    roomId: zObjectId,
    teacherId: zObjectId,
    startAt: zDateTime,
    endAt: zDateTime,
  })
  .partial()
  .strict();
export type UpdateSessionInput = z.infer<typeof UpdateSessionInput>;

/** POST /sessions/:id/cancel */
export const CancelSessionInput = z.object({ reason: zReason });
export type CancelSessionInput = z.infer<typeof CancelSessionInput>;

/** POST /classes/:id/sessions/cancel-future */
export const CancelFutureSessionsInput = z.object({ reason: zReason });
export type CancelFutureSessionsInput = z.infer<typeof CancelFutureSessionsInput>;

export const SessionDto = z.object({
  ...zDtoBase,
  classId: zObjectId,
  startAt: zDateTime,
  endAt: zDateTime,
  roomId: zObjectId,
  teacherId: zObjectId,
  status: z.nativeEnum(SessionStatus),
  cancelReason: z.string().nullable(),
  seriesId: zObjectId.nullable(),
  attendanceTakenAt: zDateTime.nullable(),
  attendanceNote: z.string().nullish(),
  createdBy: zObjectId.optional(),
  /** Derived (FR-SCH-08): true once endAt has passed and status is SCHEDULED. */
  completed: z.boolean().optional(),
  classCode: z.string().optional(),
  roomName: z.string().optional(),
  teacherName: z.string().optional(),
});
export type SessionDto = z.infer<typeof SessionDto>;

/** Ruling R3 */
export const SessionConflictDto = z.object({
  sessionId: zObjectId.optional(),
  placementTestId: zObjectId.optional(),
  kind: z.enum(['ROOM', 'TEACHER']),
  classId: zObjectId.optional(),
  classCode: z.string().optional(),
  startAt: zDateTime,
  endAt: zDateTime,
  roomId: zObjectId,
  teacherId: zObjectId,
});
export type SessionConflictDto = z.infer<typeof SessionConflictDto>;

export const CheckConflictsResultDto = z.object({ conflicts: z.array(SessionConflictDto) });
export type CheckConflictsResultDto = z.infer<typeof CheckConflictsResultDto>;

export const SessionWarning = z.object({
  code: z.literal('ROOM_TOO_SMALL'),
  roomCapacity: z.number().int(),
  classMaxCapacity: z.number().int(),
});
export type SessionWarning = z.infer<typeof SessionWarning>;

/** POST /sessions, PATCH /sessions/:id (D2) */
export const CreateSessionResultDto = z.object({ session: SessionDto, warnings: z.array(SessionWarning) });
export type CreateSessionResultDto = z.infer<typeof CreateSessionResultDto>;

export const BulkCreateSessionsResultDto = z.object({
  seriesId: zObjectId,
  sessions: z.array(SessionDto),
  warnings: z.array(SessionWarning),
});
export type BulkCreateSessionsResultDto = z.infer<typeof BulkCreateSessionsResultDto>;

export const CancelFutureSessionsResultDto = z.object({ cancelled: z.number().int().nonnegative() });
export type CancelFutureSessionsResultDto = z.infer<typeof CancelFutureSessionsResultDto>;
