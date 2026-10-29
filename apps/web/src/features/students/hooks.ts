import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateStudentContactInput, UpdateStudentInput } from '@lc/shared';
import { studentsApi, type StudentListParams } from './api';

const KEY = 'students';

export const useStudents = (params: StudentListParams) =>
  useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: () => studentsApi.list(params),
    placeholderData: keepPreviousData,
  });

export const useStudent = (id: string) =>
  useQuery({ queryKey: [KEY, 'detail', id], queryFn: () => studentsApi.get(id) });

export const useMyProfile = () =>
  useQuery({ queryKey: [KEY, 'me'], queryFn: () => studentsApi.me() });

export const useStudentAudit = (id: string, page: number, limit: number) =>
  useQuery({
    queryKey: [KEY, 'audit', id, page, limit],
    queryFn: () => studentsApi.audit(id, { page, limit }),
    placeholderData: keepPreviousData,
  });

export function useUpdateStudent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStudentInput) => studentsApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateMyContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateStudentContactInput) => studentsApi.updateContact(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUploadDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => studentsApi.uploadDocument(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId: string) => studentsApi.deleteDocument(id, docId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
