import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TakeAttendanceInput, UpdateAttendanceInput } from '@lc/shared';
import { attendanceApi } from './api';

const KEY = 'attendance';

export const useAttendanceSession = (sessionId: string) =>
  useQuery({ queryKey: [KEY, 'session', sessionId], queryFn: () => attendanceApi.session(sessionId) });

export const useAttendanceSettings = () =>
  useQuery({ queryKey: [KEY, 'settings'], queryFn: attendanceApi.settings });

export const useSessionAttendance = (sessionId: string) =>
  useQuery({ queryKey: [KEY, 'roster', sessionId], queryFn: () => attendanceApi.get(sessionId) });

export function useTakeAttendance(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TakeAttendanceInput) => attendanceApi.take(sessionId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateAttendance(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAttendanceInput) => attendanceApi.update(sessionId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
