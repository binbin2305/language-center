import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_GENDERS, ALL_STUDENT_STATUSES, Gender, StudentStatus, removeVietnameseTones } from '@lc/shared';
import { Models } from '../models';
import { VN_PHONE_REGEX, clockTimestamps } from './helpers';

export interface StudentDocument {
  _id: Types.ObjectId;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  uploadedAt: Date;
  uploadedBy: Types.ObjectId;
}

export interface Student {
  code: string;
  fullName: string;
  fullNameSearch: string;
  dob: Date;
  gender: Gender;
  phone: string;
  email: string | null;
  address?: string;
  status: StudentStatus;
  leadId?: Types.ObjectId;
  userId?: Types.ObjectId;
  documents: StudentDocument[];
  note?: string;
  createdBy?: Types.ObjectId;
  deletedAt: Date | null;
}

const DocumentSchema = new Schema<StudentDocument>({
  fileName: { type: String, required: true },
  mimeType: { type: String, required: true, enum: ['image/png', 'image/jpeg', 'application/pdf'] },
  size: { type: Number, required: true, min: 0, max: 5 * 1024 * 1024 },
  path: { type: String, required: true },
  uploadedAt: { type: Date, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
});

// leadId unique index is partial ($type) so missing and null values are skipped.
export const StudentSchema = new Schema<Student>(
  {
    code: { type: String, required: true },
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    fullNameSearch: { type: String, default: '' },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ALL_GENDERS, required: true },
    phone: { type: String, required: true, match: VN_PHONE_REGEX },
    email: { type: String, lowercase: true, trim: true, default: null },
    address: { type: String },
    status: { type: String, enum: ALL_STUDENT_STATUSES, default: StudentStatus.ACTIVE },
    leadId: { type: Schema.Types.ObjectId, ref: Models.Lead },
    userId: { type: Schema.Types.ObjectId, ref: Models.User },
    documents: { type: [DocumentSchema], default: [] },
    note: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: Models.User },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: clockTimestamps, collection: 'students' },
);
const toSearch = (fullName: string) => removeVietnameseTones(fullName).toLowerCase().trim();

StudentSchema.pre('validate', function () {
  if (this.fullName) this.fullNameSearch = toSearch(this.fullName);
});
// Keep fullNameSearch in sync when fullName changes through query updates (plain or $set).
StudentSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
  const update = this.getUpdate();
  if (!update || Array.isArray(update)) return;
  const $set = update.$set as Record<string, unknown> | undefined;
  if (typeof $set?.fullName === 'string') $set.fullNameSearch = toSearch($set.fullName);
  if (typeof update.fullName === 'string') update.fullNameSearch = toSearch(update.fullName);
});
StudentSchema.index({ code: 1 }, { unique: true });
StudentSchema.index({ leadId: 1 }, { unique: true, partialFilterExpression: { leadId: { $type: 'objectId' } } });
StudentSchema.index({ phone: 1 });
StudentSchema.index({ fullNameSearch: 1 });
StudentSchema.index({ email: 1 });
// GET /students default page: { deletedAt: null } sorted -createdAt (NFR-02).
StudentSchema.index({ deletedAt: 1, createdAt: -1, _id: -1 });

export type StudentDoc = HydratedDocument<Student>;
