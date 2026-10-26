import { z } from 'zod';
import { RoomStatus } from '../enums';
import { zDtoBase, zPagination } from './common';

export const CreateRoomInput = z.object({
  code: z.string().trim().min(1).max(30).toUpperCase(),
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().positive(),
  status: z.nativeEnum(RoomStatus).optional(),
});
export type CreateRoomInput = z.infer<typeof CreateRoomInput>;

export const UpdateRoomInput = CreateRoomInput.omit({ code: true }).partial().strict();
export type UpdateRoomInput = z.infer<typeof UpdateRoomInput>;

export const ListRoomsQuery = zPagination.extend({
  status: z.nativeEnum(RoomStatus).optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListRoomsQuery = z.infer<typeof ListRoomsQuery>;

export const RoomDto = z.object({
  ...zDtoBase,
  code: z.string(),
  name: z.string(),
  capacity: z.number().int(),
  status: z.nativeEnum(RoomStatus),
});
export type RoomDto = z.infer<typeof RoomDto>;
