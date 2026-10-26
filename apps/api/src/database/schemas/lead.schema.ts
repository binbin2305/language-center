import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_GENDERS, ALL_LEAD_STATUSES, Gender, LeadStatus } from '@lc/shared';
import { Models } from '../models';
import { VN_PHONE_REGEX } from './helpers';

export interface Lead {
  fullName: string;
  dob: Date;
  gender: Gender;
  phone: string;
  email: string | null;
  address?: string;
  interestedCourseId: Types.ObjectId;
  note?: string;
  status: LeadStatus;
  studentId: Types.ObjectId | null;
  createdBy?: Types.ObjectId;
  deletedAt: Date | null;
}

export const LeadSchema = new Schema<Lead>(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ALL_GENDERS, required: true },
    phone: { type: String, required: true, match: VN_PHONE_REGEX },
    email: { type: String, lowercase: true, trim: true, default: null },
    address: { type: String },
    interestedCourseId: { type: Schema.Types.ObjectId, ref: Models.Course, required: true },
    note: { type: String },
    status: { type: String, enum: ALL_LEAD_STATUSES, default: LeadStatus.NEW },
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: Models.User },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'leads' },
);
LeadSchema.index({ phone: 1 });
LeadSchema.index({ email: 1 });
LeadSchema.index({ status: 1, createdAt: -1 });

export type LeadDoc = HydratedDocument<Lead>;
