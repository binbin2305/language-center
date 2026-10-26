import { HydratedDocument, Schema, Types } from 'mongoose';
import { Models } from '../models';
import { clockTimestamps, scoreField } from './helpers';

export interface GradeHistoryEntry {
  fromScore: number | null;
  toScore: number | null;
  fromComment?: string;
  toComment?: string;
  reason: string;
  by: Types.ObjectId;
  at: Date;
}

export interface Grade {
  assessmentId: Types.ObjectId;
  classId: Types.ObjectId;
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId;
  score: number | null;
  comment?: string;
  isDraft: boolean;
  history: GradeHistoryEntry[];
}

const HistorySchema = new Schema<GradeHistoryEntry>(
  {
    fromScore: { type: Number, default: null },
    toScore: { type: Number, default: null },
    fromComment: { type: String },
    toComment: { type: String },
    reason: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

export const GradeSchema = new Schema<Grade>(
  {
    assessmentId: { type: Schema.Types.ObjectId, ref: Models.Assessment, required: true },
    classId: { type: Schema.Types.ObjectId, ref: Models.Class, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    enrollmentId: { type: Schema.Types.ObjectId, ref: Models.Enrollment, required: true },
    score: scoreField,
    comment: { type: String, maxlength: 1000 },
    isDraft: { type: Boolean, default: true },
    history: { type: [HistorySchema], default: [] },
  },
  { timestamps: clockTimestamps, collection: 'grades' },
);
GradeSchema.index({ assessmentId: 1, studentId: 1 }, { unique: true });
GradeSchema.index({ studentId: 1 });
GradeSchema.index({ classId: 1 });

export type GradeDoc = HydratedDocument<Grade>;
