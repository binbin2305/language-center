import { HydratedDocument, Schema } from 'mongoose';
import { ALL_COURSE_STATUSES, CourseStatus } from '@lc/shared';
import { money } from './helpers';

export interface Course {
  code: string;
  name: string;
  language: string;
  levels: string[];
  description?: string;
  totalSessions: number;
  baseFee: number;
  status: CourseStatus;
}

export const CourseSchema = new Schema<Course>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    language: { type: String, required: true, trim: true },
    levels: {
      type: [String],
      validate: { validator: (v: string[]) => v.length >= 1, message: 'levels must have at least 1 item' },
    },
    description: { type: String },
    totalSessions: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
    },
    baseFee: money({ required: true }),
    status: { type: String, enum: ALL_COURSE_STATUSES, default: CourseStatus.ACTIVE },
  },
  { timestamps: true, collection: 'courses' },
);
CourseSchema.index({ code: 1 }, { unique: true });

export type CourseDoc = HydratedDocument<Course>;
