import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_CLASS_STATUSES, ClassStatus } from '@lc/shared';
import { Models } from '../models';
import { nullableRef } from './helpers';

export interface Class {
  code: string;
  name: string;
  courseId: Types.ObjectId;
  level: string;
  teacherId: Types.ObjectId;
  assistantTeacherId: Types.ObjectId | null;
  defaultRoomId: Types.ObjectId | null;
  maxCapacity: number;
  currentSize: number;
  startDate: Date;
  endDate: Date;
  status: ClassStatus;
}

const isInt = (v: number) => Number.isInteger(v);

export const ClassSchema = new Schema<Class>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    courseId: { type: Schema.Types.ObjectId, ref: Models.Course, required: true },
    level: { type: String, required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    assistantTeacherId: nullableRef(Models.User),
    defaultRoomId: nullableRef(Models.Room),
    maxCapacity: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      validate: { validator: isInt, message: '{PATH} must be an integer' },
    },
    currentSize: {
      type: Number,
      default: 0,
      min: 0,
      validate: [
        { validator: isInt, message: '{PATH} must be an integer' },
        {
          validator(this: { maxCapacity?: number }, v: number) {
            return this.maxCapacity === undefined || v <= this.maxCapacity;
          },
          message: 'currentSize must not exceed maxCapacity',
        },
      ],
    },
    startDate: { type: Date, required: true },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator(this: { startDate?: Date }, v: Date) {
          return !this.startDate || v >= this.startDate;
        },
        message: 'endDate must be on or after startDate',
      },
    },
    status: { type: String, enum: ALL_CLASS_STATUSES, default: ClassStatus.PLANNED },
  },
  { timestamps: true, collection: 'classes' },
);
ClassSchema.index({ code: 1 }, { unique: true });
ClassSchema.index({ courseId: 1, level: 1, status: 1 });
ClassSchema.index({ teacherId: 1 });

export type ClassDoc = HydratedDocument<Class>;
