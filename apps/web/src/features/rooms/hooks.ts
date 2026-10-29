import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateRoomInput } from '@lc/shared';
import { roomsApi, type RoomListParams } from './api';

const KEY = 'rooms';

export const useRooms = (params: RoomListParams, enabled = true) =>
  useQuery({ queryKey: [KEY, 'list', params], queryFn: () => roomsApi.list(params), enabled });

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: roomsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoomInput }) => roomsApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
