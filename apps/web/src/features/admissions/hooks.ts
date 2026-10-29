import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLeadInput } from '@lc/shared';
import { leadsApi, type LeadListParams } from './api';

const KEY = 'leads';

export const useLeads = (params: LeadListParams) =>
  useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: () => leadsApi.list(params),
    placeholderData: keepPreviousData,
  });

export const useLead = (id: string) =>
  useQuery({ queryKey: [KEY, 'detail', id], queryFn: () => leadsApi.get(id) });

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { input: CreateLeadInput; force: boolean }) =>
      leadsApi.create(v.input, v.force),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useConvertLead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => leadsApi.convert(id, force),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
