import type { Types } from 'mongoose';
import type { AttendanceDto, AttendanceHistoryEntry, AttendanceStatus, SessionAttendanceDto } from '@lc/shared';
import type { Attendance } from '../../database/schemas/attendance.schema';

export interface RosterRow {
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  studentCode: string;
  fullName: string;
  record: (Attendance & { _id: Types.ObjectId }) | undefined;
  absenceRate: number;
}

export function toHistoryDto(h: Attendance['history']): AttendanceHistoryEntry[] {
  return h.map((e) => ({
    from: e.from ?? null,
    to: e.to,
    ...(e.reason !== undefined ? { reason: e.reason } : {}),
    by: e.by.toString(),
    at: e.at.toISOString(),
  }));
}

export function toSessionAttendanceDto(args: {
  sessionId: Types.ObjectId;
  takenAt: Date | null;
  takenByName: string | null;
  editable: boolean;
  sessionNote?: string;
  rows: RosterRow[];
}): SessionAttendanceDto {
  return {
    sessionId: args.sessionId.toString(),
    taken: args.takenAt !== null,
    takenAt: args.takenAt ? args.takenAt.toISOString() : null,
    takenByName: args.takenByName,
    editable: args.editable,
    ...(args.sessionNote !== undefined ? { sessionNote: args.sessionNote } : {}),
    roster: args.rows.map((r) => ({
      studentId: r.studentId.toString(),
      enrollmentId: r.enrollmentId.toString(),
      studentCode: r.studentCode,
      fullName: r.fullName,
      status: (r.record?.status ?? null) as AttendanceStatus | null,
      ...(r.record?.note !== undefined ? { note: r.record.note } : {}),
      history: r.record ? toHistoryDto(r.record.history) : [],
      absenceRate: r.absenceRate,
    })),
  };
}

export function toAttendanceDto(
  r: Attendance & { _id: Types.ObjectId; createdAt?: Date; updatedAt?: Date },
  sessionStartAt: Date,
  studentName: string | undefined,
  classCode: string | undefined,
): AttendanceDto {
  return {
    id: r._id.toString(),
    createdAt: (r.createdAt ?? sessionStartAt).toISOString(),
    updatedAt: (r.updatedAt ?? r.createdAt ?? sessionStartAt).toISOString(),
    sessionId: r.sessionId.toString(),
    classId: r.classId.toString(),
    studentId: r.studentId.toString(),
    enrollmentId: r.enrollmentId.toString(),
    status: r.status,
    ...(r.note !== undefined ? { note: r.note } : {}),
    recordedBy: String(r.recordedBy ?? ''),
    history: toHistoryDto(r.history),
    sessionStartAt: sessionStartAt.toISOString(),
    ...(studentName !== undefined ? { studentName } : {}),
    ...(classCode !== undefined ? { classCode } : {}),
  };
}
