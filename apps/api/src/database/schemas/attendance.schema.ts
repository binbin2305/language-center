import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_ATTENDANCE_STATUSES, AttendanceStatus } from '@lc/shared';
import { Models } from '../models';

export interface AttendanceHistoryEntry {
  from: AttendanceStatus;
  to: AttendanceStatus;
  reason?: string;
  by: Types.ObjectId;
  at: Date;
}

export interface Attendance {
  sessionId: Types.ObjectId;
  classId: Types.ObjectId;
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  status: AttendanceStatus;
  note?: string;
  recordedBy?: Types.ObjectId;
  history: AttendanceHistoryEntry[];
}

const HistorySchema = new Schema<AttendanceHistoryEntry>(
  {
    from: { type: String, enum: ALL_ATTENDANCE_STATUSES, required: true },
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
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: Models.Enrollment, required: true },
    status: { type: String, enum: ALL_ATTENDANCE_STATUSES, required: true },
    note: { type: String },
    recordedBy: { type: Schema.Types.ObjectId, ref: Models.User },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: true, collection: 'attendances' },
);
AttendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
AttendanceSchema.index({ studentId: 1, createdAt: -1 });
AttendanceSchema.index({ classId: 1, status: 1 });

export type AttendanceDoc = HydratedDocument<Attendance>;
