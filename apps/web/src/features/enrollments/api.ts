import type {
  AssignClassInput,
  ClassDto,
  EnrollmentDto,
  ListEnrollmentsQuery,
  TransferEnrollmentInput,
  WaitingEnrollmentDto,
  WithdrawEnrollmentInput,
} from '@lc/shared';
import { apiGet, apiGetPage, apiPost } from '@/lib/api';

export type EnrollmentListParams = Partial<ListEnrollmentsQuery>;

/** Classes of a course that are open (PLANNED|ONGOING) and still have a seat. */
export interface OpenClassParams {
  courseId: string;
}

export const enrollmentsApi = {
  list: (params: EnrollmentListParams) => apiGetPage<EnrollmentDto>('enrollments', params),
  waiting: (params: { page: number; limit: number; courseId?: string }) =>
    apiGetPage<WaitingEnrollmentDto>('enrollments/waiting', params),
  mine: () => apiGet<EnrollmentDto[]>('enrollments/me'),
  openClasses: ({ courseId }: OpenClassParams) =>
    apiGetPage<ClassDto>('classes', { courseId, open: true, hasSeat: true, limit: 100 }),
  assign: (id: string, input: AssignClassInput) => apiPost<EnrollmentDto>(`enrollments/${id}/assign`, input),
  transfer: (id: string, input: TransferEnrollmentInput) =>
    apiPost<EnrollmentDto>(`enrollments/${id}/transfer`, input),
  withdraw: (id: string, input: WithdrawEnrollmentInput) =>
    apiPost<EnrollmentDto>(`enrollments/${id}/withdraw`, input),
  resume: (id: string) => apiPost<EnrollmentDto>(`enrollments/${id}/resume`),
  confirm: (id: string) => apiPost<EnrollmentDto>(`enrollments/${id}/confirm`),
};
