import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_ASSESSMENT_TYPES, AssessmentType } from '@lc/shared';
import { Models } from '../models';

export interface Assessment {
  classId: Types.ObjectId;
  name: string;
  type: AssessmentType;
  weight: number;
  heldOn: Date;
  confirmedAt: Date | null;
  unlockedUntil: Date | null;
  createdBy?: Types.ObjectId;
}

export const AssessmentSchema = new Schema<Assessment>(
  {
    classId: { type: Schema.Types.ObjectId, ref: Models.Class, required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ALL_ASSESSMENT_TYPES, required: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    heldOn: { type: Date, required: true },
    confirmedAt: { type: Date, default: null },
    unlockedUntil: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: Models.User },
  },
  { timestamps: true, collection: 'assessments' },
);
AssessmentSchema.index({ classId: 1, heldOn: 1 });

export type AssessmentDoc = HydratedDocument<Assessment>;
