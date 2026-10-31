import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListResultsQuery, AmendGradeInput, CreateAssessmentInput, UpsertGradesInput } from '@lc/shared';
import { ApiError } from '@/lib/api';
import { gradesApi } from './api';

const KEY = 'grades';

export const useAssessments = (classId: string) =>
  useQuery({ queryKey: [KEY, 'assessments', classId], queryFn: () => gradesApi.listAssessments(classId) });

export const useAssessmentGrades = (id: string) =>
  useQuery({ queryKey: [KEY, 'grades', id], queryFn: () => gradesApi.grades(id) });

export const useResults = (params: Partial<ListResultsQuery>, enabled = true) =>
  useQuery({
    queryKey: [KEY, 'results', params],
    queryFn: () => gradesApi.results(params),
    enabled,
    placeholderData: keepPreviousData,
    retry: (count, e) => !(e instanceof ApiError) && count < 2,
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useCreateAssessment(classId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateAssessmentInput) => gradesApi.createAssessment(classId, input),
    onSuccess: invalidate,
  });
}

export function useSaveGrades(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpsertGradesInput) => gradesApi.saveGrades(id, input),
    onSuccess: invalidate,
  });
}

export function useAmendGrade(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { studentId: string } & AmendGradeInput) => {
      const { studentId, ...input } = v;
      return gradesApi.amendGrade(id, studentId, input);
    },
    onSuccess: invalidate,
  });
}
