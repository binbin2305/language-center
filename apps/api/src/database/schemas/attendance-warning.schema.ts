import { HydratedDocument, Schema, Types } from 'mongoose';
import { Models } from '../models';
import { clockTimestamps } from './helpers';

export interface AttendanceWarning {
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  triggeredAt: Date;
  absenceRate: number;
}

export const AttendanceWarningSchema = new Schema<AttendanceWarning>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    classId: { type: Schema.Types.ObjectId, ref: Models.Class, required: true },
    triggeredAt: { type: Date, required: true },
    absenceRate: { type: Number, required: true, min: 0, max: 1 },
  },
  { timestamps: clockTimestamps, collection: 'attendance_warnings' },
);
AttendanceWarningSchema.index({ studentId: 1, classId: 1 }, { unique: true });

export type AttendanceWarningDoc = HydratedDocument<AttendanceWarning>;
