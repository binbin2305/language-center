import type { CreateRoomInput, ListRoomsQuery, RoomDto, UpdateRoomInput } from '@lc/shared';
import { apiGetPage, apiPatch, apiPost } from '@/lib/api';

export type RoomListParams = Partial<Pick<ListRoomsQuery, 'page' | 'limit' | 'sort' | 'status' | 'q'>>;

export const roomsApi = {
  list: (params: RoomListParams) => apiGetPage<RoomDto>('rooms', params),
  create: (input: CreateRoomInput) => apiPost<RoomDto>('rooms', input),
  update: (id: string, input: UpdateRoomInput) => apiPatch<RoomDto>(`rooms/${id}`, input),
};
