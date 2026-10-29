import { Types } from 'mongoose';
import type { RoomDto } from '@lc/shared';
import type { Room } from '../../database/schemas/room.schema';

export type RoomLean = Room & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toRoomDto(r: RoomLean): RoomDto {
  return {
    id: r._id.toString(),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    code: r.code,
    name: r.name,
    capacity: r.capacity,
    status: r.status,
  };
}
