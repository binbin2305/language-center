import type { Types } from 'mongoose';
import type { SessionDto } from '@lc/shared';
import type { Session, SessionDoc } from '../../database/schemas/session.schema';

type SessionRecord = Session & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

/** Maps a hydrated session document to its DTO (never returns the document itself). */
export function toSessionDto(doc: SessionDoc): SessionDto {
  const s = doc.toObject() as unknown as SessionRecord;
  return {
    id: s._id.toString(),
    classId: s.classId.toString(),
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    roomId: s.roomId.toString(),
    teacherId: s.teacherId.toString(),
    status: s.status,
    cancelReason: s.cancelReason ?? null,
    seriesId: s.seriesId ? s.seriesId.toString() : null,
    attendanceTakenAt: s.attendanceTakenAt ? s.attendanceTakenAt.toISOString() : null,
    ...(s.attendanceNote !== undefined ? { attendanceNote: s.attendanceNote } : {}),
    ...(s.createdBy ? { createdBy: s.createdBy.toString() } : {}),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Read-model DTO (FR-SCH-06/08): adds display names and the derived `completed` flag. */
export function toSessionViewDto(
  doc: SessionDoc,
  now: Date,
  names: { classCode?: string; roomName?: string; teacherName?: string },
): SessionDto {
  const dto = toSessionDto(doc);
  return {
    ...dto,
    completed: dto.attendanceTakenAt !== null && new Date(dto.endAt) < now,
    ...(names.classCode !== undefined ? { classCode: names.classCode } : {}),
    ...(names.roomName !== undefined ? { roomName: names.roomName } : {}),
    ...(names.teacherName !== undefined ? { teacherName: names.teacherName } : {}),
  };
}
