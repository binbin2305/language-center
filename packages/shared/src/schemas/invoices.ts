import { z } from 'zod';
import { DiscountStatus, InvoiceKind, InvoiceStatus, PaymentMethod, PaymentStatus } from '../enums';
import { zBoolQuery, zDateOnly, zDateTime, zDtoBase, zMoney, zObjectId, zPagination, zReason } from './common';

/** POST /invoices — manual SURCHARGE (phụ thu). */
export const CreateInvoiceInput = z.object({
  studentId: zObjectId,
  enrollmentId: zObjectId.optional(),
  courseId: zObjectId.optional(),
  classId: zObjectId.optional(),
  description: z.string().trim().min(1).max(300),
  amountDue: zMoney,
  dueDate: zDateOnly,
});
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceInput>;

export const ListInvoicesQuery = zPagination.extend({
  studentId: zObjectId.optional(),
  classId: zObjectId.optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  kind: z.nativeEnum(InvoiceKind).optional(),
  overdue: zBoolQuery.optional(),
  from: zDateOnly.optional(),
  to: zDateOnly.optional(),
});
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuery>;

/** POST /invoices/:id/discount. Validity (isValidDiscount) is a service rule -> DISCOUNT_INVALID. */
export const ApplyDiscountInput = z.object({
  kind: z.enum(['PERCENT', 'AMOUNT']),
  value: z.number(),
  reason: zReason,
});
export type ApplyDiscountInput = z.infer<typeof ApplyDiscountInput>;

/** POST /invoices/:id/discount/decision */
export const DecideDiscountInput = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});
export type DecideDiscountInput = z.infer<typeof DecideDiscountInput>;

/** POST /invoices/:id/payments */
export const RecordPaymentInput = z.object({
  amount: z.number().int().positive(),
  method: z.nativeEnum(PaymentMethod),
  paidAt: zDateTime.optional(),
  note: z.string().trim().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentInput>;

/** POST /payments/:id/void */
export const VoidPaymentInput = z.object({ reason: zReason });
export type VoidPaymentInput = z.infer<typeof VoidPaymentInput>;

/** POST /invoices/:id/void (reason optional shape; recorded when given) */
export const VoidInvoiceInput = z.object({ reason: zReason.optional() });
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceInput>;

export const DiscountDto = z.object({
  kind: z.enum(['PERCENT', 'AMOUNT']),
  value: z.number(),
  amount: zMoney,
  reason: z.string(),
  status: z.nativeEnum(DiscountStatus),
  requestedBy: zObjectId,
  decidedBy: zObjectId.nullable(),
  decidedAt: zDateTime.nullable(),
});
export type DiscountDto = z.infer<typeof DiscountDto>;

export const PaymentDto = z.object({
  ...zDtoBase,
  code: z.string(),
  invoiceId: zObjectId,
  studentId: zObjectId,
  amount: zMoney,
  method: z.nativeEnum(PaymentMethod),
  paidAt: zDateTime,
  note: z.string().nullish(),
  status: z.nativeEnum(PaymentStatus),
  voidReason: z.string().nullable(),
  voidedBy: zObjectId.nullable(),
  voidedAt: zDateTime.nullable(),
  recordedBy: zObjectId,
});
export type PaymentDto = z.infer<typeof PaymentDto>;

export const InvoiceDto = z.object({
  ...zDtoBase,
  code: z.string(),
  kind: z.nativeEnum(InvoiceKind),
  studentId: zObjectId,
  enrollmentId: zObjectId.nullable(),
  courseId: zObjectId.nullable(),
  description: z.string().nullish(),
  classId: zObjectId.nullable(),
  amountDue: zMoney,
  discount: DiscountDto.nullable(),
  finalAmount: zMoney,
  amountPaid: zMoney,
  balance: zMoney,
  dueDate: zDateOnly,
  status: z.nativeEnum(InvoiceStatus),
  studentName: z.string().optional(),
  studentCode: z.string().optional(),
  /** Derived: dueDate passed and balance > 0 and status not VOID */
  overdue: z.boolean().optional(),
});
export type InvoiceDto = z.infer<typeof InvoiceDto>;

/** GET /invoices/:id — with payments. */
export const InvoiceDetailDto = InvoiceDto.extend({ payments: z.array(PaymentDto) });
export type InvoiceDetailDto = z.infer<typeof InvoiceDetailDto>;
