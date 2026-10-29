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
