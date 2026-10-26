import { HydratedDocument, Schema } from 'mongoose';

export const RoomStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

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
    status: { type: String, enum: Object.values(RoomStatus), default: RoomStatus.ACTIVE },
  },
  { timestamps: true, collection: 'rooms' },
);
RoomSchema.index({ code: 1 }, { unique: true });

export type RoomDoc = HydratedDocument<Room>;
