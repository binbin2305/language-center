import type {
  ConvertLeadResultDto,
  CreateLeadInput,
  LeadDto,
  ListLeadsQuery,
} from '@lc/shared';
import { apiGet, apiGetPage, apiPost } from '@/lib/api';

export type LeadListParams = Partial<ListLeadsQuery>;

const forceSuffix = (force: boolean) => (force ? '?force=true' : '');

export const leadsApi = {
  list: (params: LeadListParams) => apiGetPage<LeadDto>('leads', params),
  get: (id: string) => apiGet<LeadDto>(`leads/${id}`),
  create: (input: CreateLeadInput, force: boolean) =>
    apiPost<LeadDto>(`leads${forceSuffix(force)}`, input),
  convert: (id: string, force: boolean) =>
    apiPost<ConvertLeadResultDto>(`leads/${id}/convert${forceSuffix(force)}`),
};
