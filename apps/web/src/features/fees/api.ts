import type {
  ApplyDiscountInput,
  DecideDiscountInput,
  InvoiceDetailDto,
  InvoiceDto,
  InvoiceTeacherViewDto,
  ListInvoicesQuery,
  RecordPaymentInput,
  VoidInvoiceInput,
  VoidPaymentInput,
  PaymentDto,
} from '@lc/shared';
import { apiGet, apiGetBlob, apiGetPage, apiPost } from '@/lib/api';

export type InvoiceListParams = Partial<
  Pick<ListInvoicesQuery, 'page' | 'limit' | 'studentId' | 'classId' | 'status' | 'overdue' | 'from' | 'to'>
>;
/** Role-dependent list row: teachers get the reduced view. */
export type InvoiceRow = InvoiceDto | InvoiceTeacherViewDto;

export const feesApi = {
  list: (params: InvoiceListParams) => apiGetPage<InvoiceRow>('invoices', params),
  pending: (params: { page: number; limit: number }) => apiGetPage<InvoiceDto>('invoices/discounts/pending', params),
  get: (id: string) => apiGet<InvoiceDetailDto>(`invoices/${id}`),
  pay: (id: string, input: RecordPaymentInput) => apiPost<PaymentDto>(`invoices/${id}/payments`, input),
  voidPayment: (id: string, input: VoidPaymentInput) => apiPost<PaymentDto>(`payments/${id}/void`, input),
  voidInvoice: (id: string, input: VoidInvoiceInput) => apiPost<InvoiceDto>(`invoices/${id}/void`, input),
  applyDiscount: (id: string, input: ApplyDiscountInput) => apiPost<InvoiceDto>(`invoices/${id}/discount`, input),
  decideDiscount: (id: string, input: DecideDiscountInput) =>
    apiPost<InvoiceDto>(`invoices/${id}/discount/decision`, input),
  receipt: (paymentId: string) => apiGetBlob(`payments/${paymentId}/receipt.pdf`),
};
