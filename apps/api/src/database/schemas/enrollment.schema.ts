import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_ENROLLMENT_STATUSES, EnrollmentStatus } from '@lc/shared';
import { ACTIVE_ENROLLMENT_STATUSES } from '../active-enrollment';
import { Models } from '../models';
import { clockTimestamps, nullableRef } from './helpers';

export interface ReasonStamp {
  reason: string;
  by: Types.ObjectId;
  at: Date;
}
export interface EnrollmentHistoryEntry {
  from: EnrollmentStatus | null;
  to: EnrollmentStatus;
  at: Date;
  by?: Types.ObjectId;
  reason?: string;
  /** R22: on entries that open an ENROLLED stint, the class seated in (absent on legacy rows). */
  classId?: Types.ObjectId;
}

export interface Enrollment {
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  classId: Types.ObjectId | null;
  status: EnrollmentStatus;
  placementLevel: string | null;
  placementSkipped: ReasonStamp | null;
  levelOverride: ReasonStamp | null;
  waitingSince: Date | null;
  enrolledAt: Date | null;
  confirmedAt: Date | null;
  transferredToId: Types.ObjectId | null;
  transferredFromId: Types.ObjectId | null;
  invoiceId: Types.ObjectId | null;
  /** R22: every class this enrollment was ever seated in (assign/transfer $addToSet); history scope = classId ∪ classHistory. */
  classHistory: Types.ObjectId[];
  history: EnrollmentHistoryEntry[];
}

const StampSchema = new Schema<ReasonStamp>(
  {
    reason: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);
const HistorySchema = new Schema<EnrollmentHistoryEntry>(
  {
    from: { type: String, enum: [...ALL_ENROLLMENT_STATUSES, null], default: null },
    to: { type: String, enum: ALL_ENROLLMENT_STATUSES, required: true },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: Models.User },
    reason: { type: String },
    classId: { type: Schema.Types.ObjectId, ref: Models.Class },
  },
  { _id: false },
);

export const EnrollmentSchema = new Schema<Enrollment>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    courseId: { type: Schema.Types.ObjectId, ref: Models.Course, required: true },
    classId: nullableRef(Models.Class),
    status: { type: String, enum: ALL_ENROLLMENT_STATUSES, default: EnrollmentStatus.PENDING_PLACEMENT },
    placementLevel: { type: String, default: null },
    placementSkipped: { type: StampSchema, default: null },
    levelOverride: { type: StampSchema, default: null },
    waitingSince: { type: Date, default: null },
    enrolledAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    transferredToId: nullableRef(Models.Enrollment),
    transferredFromId: nullableRef(Models.Enrollment),
    invoiceId: nullableRef(Models.Invoice),
    classHistory: { type: [{ type: Schema.Types.ObjectId, ref: Models.Class }], default: [] },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: clockTimestamps, collection: 'enrollments' },
);
EnrollmentSchema.index({ studentId: 1, courseId: 1, status: 1 });
// At most one active enrollment per (student, course); closes the check-then-insert race.
EnrollmentSchema.index(
  { studentId: 1, courseId: 1 },
  { unique: true, name: 'uniq_active_student_course', partialFilterExpression: { status: { $in: [...ACTIVE_ENROLLMENT_STATUSES] } } },
);
EnrollmentSchema.index({ classId: 1, status: 1 });
EnrollmentSchema.index({ status: 1, waitingSince: 1 });

export type EnrollmentDoc = HydratedDocument<Enrollment>;
