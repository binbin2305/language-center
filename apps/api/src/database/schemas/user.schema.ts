import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_ROLES, ALL_USER_STATUSES, Role, UserStatus } from '@lc/shared';
import { Models } from '../models';

export interface User {
  email?: string;
  username: string;
  passwordHash: string;
  fullName: string;
  phone?: string;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  failedLoginCount: number;
  failedLoginWindowStart: Date | null;
  lockedUntil: Date | null;
  teacherProfile?: { languages: string[]; levels: string[]; specialization?: string };
  studentId?: Types.ObjectId;
  deletedAt: Date | null;
}

// Unique indexes are partial ($type) so both missing and null values are skipped.
export const UserSchema = new Schema<User>(
  {
    email: { type: String, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String },
    role: { type: String, enum: ALL_ROLES, required: true },
    status: { type: String, enum: ALL_USER_STATUSES, default: UserStatus.ACTIVE },
    mustChangePassword: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0 },
    failedLoginWindowStart: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    teacherProfile: {
      type: new Schema(
        {
          languages: { type: [String], default: [] },
          levels: { type: [String], default: [] },
          specialization: { type: String },
        },
        { _id: false },
      ),
    },
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' },
);
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
UserSchema.index({ studentId: 1 }, { unique: true, partialFilterExpression: { studentId: { $type: 'objectId' } } });
UserSchema.index({ role: 1, status: 1 });

export type UserDoc = HydratedDocument<User>;
