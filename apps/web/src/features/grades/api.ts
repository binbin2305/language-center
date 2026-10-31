import type {
  AmendGradeInput,
  AssessmentDto,
  AssessmentGradesDto,
  CreateAssessmentInput,
  GradeDto,
  PendingAssessmentDto,
  ListResultsQuery,
  ResultDto,
  UpdateAssessmentInput,
  UpsertGradesInput,
} from '@lc/shared';
import { apiDelete, apiGet, apiGetBlob, apiGetPage, apiPatch, apiPost, apiPut } from '@/lib/api';

export const gradesApi = {
  listAssessments: (classId: string) => apiGet<AssessmentDto[]>(`classes/${classId}/assessments`),
  pendingAssessments: () => apiGet<PendingAssessmentDto[]>('assessments/pending'),
  createAssessment: (classId: string, input: CreateAssessmentInput) =>
    apiPost<AssessmentDto>(`classes/${classId}/assessments`, input),
  updateAssessment: (id: string, input: UpdateAssessmentInput) =>
    apiPatch<AssessmentDto>(`assessments/${id}`, input),
  removeAssessment: (id: string) => apiDelete(`assessments/${id}`),
  grades: (id: string) => apiGet<AssessmentGradesDto>(`assessments/${id}/grades`),
  saveGrades: (id: string, input: UpsertGradesInput) =>
    apiPut<AssessmentGradesDto>(`assessments/${id}/grades`, input),
  amendGrade: (id: string, studentId: string, input: AmendGradeInput) =>
    apiPatch<GradeDto>(`assessments/${id}/grades/${studentId}`, input),
  results: (params: Partial<ListResultsQuery>) => apiGetPage<ResultDto>('results', params),
  transcriptPdf: (studentId: string, classId: string) =>
    apiGetBlob(`results/transcript.pdf?studentId=${studentId}&classId=${classId}`),
};
