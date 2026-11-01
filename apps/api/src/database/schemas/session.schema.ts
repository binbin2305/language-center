import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_SESSION_STATUSES, SessionStatus } from '@lc/shared';
import { Models } from '../models';
import { clockTimestamps } from './helpers';

export interface Session {
  classId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  roomId: Types.ObjectId;
  teacherId: Types.ObjectId;
  status: SessionStatus;
  cancelReason: string | null;
  seriesId: Types.ObjectId | null;
  attendanceTakenAt: Date | null;
  attendanceNote?: string;
  createdBy?: Types.ObjectId;
}

export const SessionSchema = new Schema<Session>(
  {
    classId: { type: Schema.Types.ObjectId, ref: Models.Class, required: true },
    startAt: { type: Date, required: true },
    endAt: {
      type: Date,
      required: true,
      validate: {
        validator(this: { startAt?: Date }, v: Date) {
          return !this.startAt || v > this.startAt;
        },
        message: 'endAt must be after startAt',
      },
    },
    roomId: { type: Schema.Types.ObjectId, ref: Models.Room, required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    status: { type: String, enum: ALL_SESSION_STATUSES, default: SessionStatus.SCHEDULED },
    cancelReason: {
      type: String,
      default: null,
      required: [
        function (this: { status?: SessionStatus }) {
          return this.status === SessionStatus.CANCELLED;
        },
        'cancelReason is required when CANCELLED',
      ],
    },
    seriesId: { type: Schema.Types.ObjectId, default: null },
    attendanceTakenAt: { type: Date, default: null },
    attendanceNote: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: Models.User },
  },
  { timestamps: clockTimestamps, collection: 'sessions' },
);
SessionSchema.index({ roomId: 1, startAt: 1, endAt: 1 });
SessionSchema.index({ teacherId: 1, startAt: 1, endAt: 1 });
SessionSchema.index({ classId: 1, startAt: 1 });
// GET /sessions?from&to: range on startAt, sorted startAt,_id (NFR-02).
SessionSchema.index({ startAt: 1, _id: 1 });
// GET /attendance: cancelled sessions that still hold attendance (taken in the 15-minute early window).
SessionSchema.index({ status: 1, startAt: 1, _id: 1 });

export type SessionDoc = HydratedDocument<Session>;
