import { HydratedDocument, Schema } from 'mongoose';
import { ALL_ROOM_STATUSES, RoomStatus } from '@lc/shared';
import { clockTimestamps } from './helpers';

export interface Room {
  code: string;
  name: string;
  capacity: number;
  status: RoomStatus;
}

export const RoomSchema = new Schema<Room>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
    },
    status: { type: String, enum: ALL_ROOM_STATUSES, default: RoomStatus.ACTIVE },
  },
  { timestamps: clockTimestamps, collection: 'rooms' },
);
RoomSchema.index({ code: 1 }, { unique: true });

export type RoomDoc = HydratedDocument<Room>;
