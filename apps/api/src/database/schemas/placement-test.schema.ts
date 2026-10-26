import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_PLACEMENT_STATUSES, PlacementStatus } from '@lc/shared';
import { Models } from '../models';
import { scoreField } from './helpers';

export interface PlacementCandidate {
  enrollmentId: Types.ObjectId;
  studentId: Types.ObjectId;
  score: number | null;
  level: string | null;
  comment?: string;
  gradedAt: Date | null;
  gradedBy: Types.ObjectId | null;
}

export interface PlacementTest {
  courseId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  roomId: Types.ObjectId;
  teacherId: Types.ObjectId;
  status: PlacementStatus;
  candidates: PlacementCandidate[];
}

const CandidateSchema = new Schema<PlacementCandidate>(
  {
    enrollmentId: { type: Schema.Types.ObjectId, ref: Models.Enrollment, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    score: scoreField,
    level: { type: String, default: null },
    comment: { type: String },
    gradedAt: { type: Date, default: null },
    gradedBy: { type: Schema.Types.ObjectId, ref: Models.User, default: null },
  },
  { _id: false },
);

export const PlacementTestSchema = new Schema<PlacementTest>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: Models.Course, required: true },
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
    status: { type: String, enum: ALL_PLACEMENT_STATUSES, default: PlacementStatus.SCHEDULED },
    candidates: { type: [CandidateSchema], default: [] },
  },
  { timestamps: true, collection: 'placement_tests' },
);
PlacementTestSchema.index({ teacherId: 1, startAt: 1 });
PlacementTestSchema.index({ roomId: 1, startAt: 1 });

export type PlacementTestDoc = HydratedDocument<PlacementTest>;
