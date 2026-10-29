import type {
  AuditLogDto,
  ListStudentsQuery,
  StudentBriefDto,
  StudentDetailDto,
  StudentDocumentDto,
  StudentDto,
  StudentTeacherViewDto,
  UpdateStudentContactInput,
  UpdateStudentInput,
  UpdateStudentResultDto,
} from '@lc/shared';
import { apiDelete, apiGet, apiGetBlob, apiGetPage, apiPatch, apiPostForm } from '@/lib/api';

export type StudentListParams = Partial<ListStudentsQuery>;
/** GET /students/:id: staff get the full detail, teachers the reduced view. */
export type StudentView = StudentDetailDto | StudentTeacherViewDto;

/** Staff get the full profile; the teacher view (brief fields) has no gender/email/address. */
export const isFullView = (s: StudentView): s is StudentDetailDto => 'gender' in s;

export const studentsApi = {
  list: (params: StudentListParams) =>
    apiGetPage<StudentDto | StudentBriefDto>('students', params),
  get: (id: string) => apiGet<StudentView>(`students/${id}`),
  me: () => apiGet<StudentDto>('students/me'),
  update: (id: string, input: UpdateStudentInput) =>
    apiPatch<UpdateStudentResultDto>(`students/${id}`, input),
  updateContact: (input: UpdateStudentContactInput) =>
    apiPatch<UpdateStudentResultDto>('students/me/contact', input),
  uploadDocument: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiPostForm<StudentDocumentDto>(`students/${id}/documents`, form);
  },
  downloadDocument: (id: string, docId: string) =>
    apiGetBlob(`students/${id}/documents/${docId}`),
  deleteDocument: (id: string, docId: string) =>
    apiDelete(`students/${id}/documents/${docId}`),
  audit: (id: string, params: { page: number; limit: number }) =>
    apiGetPage<AuditLogDto>(`students/${id}/audit`, params),
};
