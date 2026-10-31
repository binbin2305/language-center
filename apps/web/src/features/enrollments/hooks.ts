import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AssignClassInput, TransferEnrollmentInput, WithdrawEnrollmentInput } from '@lc/shared';
import { enrollmentsApi, type EnrollmentListParams } from './api';

const KEY = 'enrollments';
const CLASS_KEY = 'enrollment-open-classes';

export const useWaitingEnrollments = (page: number, limit = 20) =>
  useQuery({
    queryKey: [KEY, 'waiting', page, limit],
    queryFn: () => enrollmentsApi.waiting({ page, limit }),
    placeholderData: keepPreviousData,
  });

export const useEnrollments = (params: EnrollmentListParams) =>
  useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: () => enrollmentsApi.list(params),
    enabled: Boolean(params.studentId),
  });

export const useMyEnrollments = () =>
  useQuery({ queryKey: [KEY, 'me'], queryFn: () => enrollmentsApi.mine() });

export const useOpenClasses = (courseId: string, enabled = true) =>
  useQuery({
    queryKey: [CLASS_KEY, courseId],
    queryFn: () => enrollmentsApi.openClasses({ courseId }),
    enabled,
    staleTime: 0,
  });

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [KEY] }),
      qc.invalidateQueries({ queryKey: [CLASS_KEY] }),
      qc.invalidateQueries({ queryKey: ['classes'] }),
    ]);
}

export function useAssign(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: AssignClassInput) => enrollmentsApi.assign(id, input),
    onSuccess: invalidate,
  });
}

export function useTransfer(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: TransferEnrollmentInput) => enrollmentsApi.transfer(id, input),
    onSuccess: invalidate,
  });
}

export function useWithdraw(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: WithdrawEnrollmentInput) => enrollmentsApi.withdraw(id, input),
    onSuccess: invalidate,
  });
}

export function useResume() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => enrollmentsApi.resume(id), onSuccess: invalidate });
}

export function useConfirm() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => enrollmentsApi.confirm(id), onSuccess: invalidate });
}
