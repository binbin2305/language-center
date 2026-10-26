import { HydratedDocument, Schema } from 'mongoose';
import { clockTimestamps } from './helpers';

export const SETTINGS_ID = 'center';

export interface Settings {
  _id: string;
  centerName: string;
  attendanceWarningThreshold: number;
  gradeLockDays: number;
  resultViewRequiresPaidFees: boolean;
  teacherAttendanceEditDays: number;
  invoiceDueDaysAfterStart: number;
}

export const SettingsSchema = new Schema<Settings>(
  {
    _id: { type: String, default: SETTINGS_ID },
    centerName: { type: String, required: true, default: 'Language Center' },
    attendanceWarningThreshold: { type: Number, default: 0.2, min: 0, max: 1 },
    gradeLockDays: { type: Number, default: 14, min: 0 },
    resultViewRequiresPaidFees: { type: Boolean, default: false },
    teacherAttendanceEditDays: { type: Number, default: 7, min: 0 },
    invoiceDueDaysAfterStart: { type: Number, default: 7, min: 0 },
  },
  { timestamps: clockTimestamps, collection: 'settings' },
);

export type SettingsDoc = HydratedDocument<Settings>;
