import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_ATTENDANCE_STATUSES, AttendanceStatus } from '@lc/shared';
import { Models } from '../models';
import { clockTimestamps } from './helpers';

export interface AttendanceHistoryEntry {
  /** null on the first take (no previous status). */
  from: AttendanceStatus | null;
  to: AttendanceStatus;
  reason?: string;
  by: Types.ObjectId;
  at: Date;
}

export interface Attendance {
  sessionId: Types.ObjectId;
  classId: Types.ObjectId;
  /** R12: copy of the session's startAt, set at write time and kept in sync when the session moves. */
  startAt: Date;
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  status: AttendanceStatus;
  note?: string;
  recordedBy?: Types.ObjectId;
  history: AttendanceHistoryEntry[];
}

const HistorySchema = new Schema<AttendanceHistoryEntry>(
  {
    from: { type: String, enum: [...ALL_ATTENDANCE_STATUSES, null], default: null },
    to: { type: String, enum: ALL_ATTENDANCE_STATUSES, required: true },
    reason: { type: String },
    by: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

export const AttendanceSchema = new Schema<Attendance>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: Models.Session, required: true },
    classId: { type: Schema.Types.ObjectId, ref: Models.Class, required: true },
    startAt: { type: Date, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: Models.Enrollment, required: true },
    status: { type: String, enum: ALL_ATTENDANCE_STATUSES, required: true },
    note: { type: String },
    recordedBy: { type: Schema.Types.ObjectId, ref: Models.User },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: clockTimestamps, collection: 'attendances' },
);
AttendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
AttendanceSchema.index({ studentId: 1, createdAt: -1 });
AttendanceSchema.index({ classId: 1, status: 1 });
// R12 GET /attendance: filter by session time and page through the index (staff / teacher / student scope).
AttendanceSchema.index({ startAt: -1, _id: -1 });
AttendanceSchema.index({ classId: 1, startAt: -1, _id: -1 });
AttendanceSchema.index({ studentId: 1, startAt: -1, _id: -1 });

export type AttendanceDoc = HydratedDocument<Attendance>;
