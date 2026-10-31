import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TakeAttendanceInput, UpdateAttendanceInput } from '@lc/shared';
import { attendanceApi, type AttendanceListParams, type AttendanceSummaryParams } from './api';

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

export const useAttendanceSummary = (params: AttendanceSummaryParams) =>
  useQuery({ queryKey: [KEY, 'summary', params], queryFn: () => attendanceApi.summary(params) });

export const useAttendanceRecords = (params: AttendanceListParams, enabled = true) =>
  useQuery({ queryKey: [KEY, 'records', params], queryFn: () => attendanceApi.listAll(params), enabled });

export const useClassSessions = (classId: string, from: string | undefined, to: string | undefined) =>
  useQuery({
    queryKey: [KEY, 'class-sessions', classId, from, to],
    queryFn: () => attendanceApi.sessions({ classId, from: from as string, to: to as string }),
    enabled: Boolean(from && to),
  });
