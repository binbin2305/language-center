import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplyDiscountInput, DecideDiscountInput, RecordPaymentInput } from '@lc/shared';
import { feesApi, type InvoiceListParams } from './api';

const KEY = 'invoices';

export const useInvoices = (params: InvoiceListParams) =>
  useQuery({ queryKey: [KEY, 'list', params], queryFn: () => feesApi.list(params), placeholderData: keepPreviousData });

export const usePendingDiscounts = (page: number, limit = 20) =>
  useQuery({
    queryKey: [KEY, 'pending', page, limit],
    queryFn: () => feesApi.pending({ page, limit }),
    placeholderData: keepPreviousData,
  });

export const useInvoice = (id: string) =>
  useQuery({ queryKey: [KEY, 'detail', id], queryFn: () => feesApi.get(id) });

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [KEY] });
}

export function useRecordPayment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (i: RecordPaymentInput) => feesApi.pay(id, i), onSuccess: invalidate });
}
export function useVoidPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => feesApi.voidPayment(v.id, { reason: v.reason }),
    onSuccess: invalidate,
  });
}
export function useApplyDiscount(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (i: ApplyDiscountInput) => feesApi.applyDiscount(id, i), onSuccess: invalidate });
}
export function useDecideDiscount() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string } & DecideDiscountInput) => feesApi.decideDiscount(v.id, { approve: v.approve, note: v.note }),
    onSuccess: invalidate,
  });
}
export function useVoidInvoice(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (reason?: string) => feesApi.voidInvoice(id, { reason }), onSuccess: invalidate });
}
