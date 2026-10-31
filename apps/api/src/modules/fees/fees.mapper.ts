import { Types } from 'mongoose';
import { InvoiceDto, InvoiceTeacherViewDto, PaymentDto, InvoiceStatus, fromDateOnly, toDateOnly, vnDay } from '@lc/shared';
import type { Payment } from '../../database/schemas/payment.schema';
import type { Invoice } from '../../database/schemas/invoice.schema';

export type InvoiceLean = Invoice & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toInvoiceDto(inv: InvoiceLean, now: Date, names: { studentName?: string; studentCode?: string } = {}): InvoiceDto {
  const d = inv.discount;
  return {
    id: inv._id.toString(),
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    code: inv.code,
    kind: inv.kind,
    studentId: inv.studentId.toString(),
    enrollmentId: inv.enrollmentId?.toString() ?? null,
    courseId: inv.courseId?.toString() ?? null,
    description: inv.description ?? null,
    classId: inv.classId?.toString() ?? null,
    amountDue: inv.amountDue,
    discount: d
      ? {
          kind: d.kind,
          value: d.value,
          amount: d.amount,
          reason: d.reason,
          status: d.status,
          requestedBy: d.requestedBy.toString(),
          decidedBy: d.decidedBy?.toString() ?? null,
          decidedAt: d.decidedAt?.toISOString() ?? null,
        }
      : null,
    finalAmount: inv.finalAmount,
    amountPaid: inv.amountPaid,
    balance: inv.balance,
    dueDate: toDateOnly(inv.dueDate),
    status: inv.status,
    overdue: isOverdue(inv, now),
    ...names,
  };
}

/** Invoice status derived from its totals (BACKEND_SCHEMA §2.16); VOID is never derived. */
export function invoiceStatus(inv: { finalAmount: number; amountPaid: number }): InvoiceStatus {
  const balance = inv.finalAmount - inv.amountPaid;
  if (inv.finalAmount === 0 || balance === 0) return InvoiceStatus.PAID;
  return inv.amountPaid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID;
}

/** Due date (VN day) already passed, money still owed, not void. A due date of today is not overdue. */
export function isOverdue(inv: Pick<Invoice, 'dueDate' | 'balance' | 'status'>, now: Date): boolean {
  return toDateOnly(inv.dueDate) < vnDay(now) && inv.balance > 0 && inv.status !== InvoiceStatus.VOID;
}

/** Query equivalent of isOverdue (single definition): due before today's VN midnight, owing, not void. */
export function overdueFilter(now: Date): Record<string, unknown> {
  return { dueDate: { $lt: fromDateOnly(vnDay(now)) }, balance: { $gt: 0 }, status: { $ne: InvoiceStatus.VOID } };
}

/** FR-FEE-06: teacher view carries no payments, discount or amounts other than the balance. */
export function toInvoiceTeacherView(inv: InvoiceLean, now: Date, names: { studentName?: string; studentCode?: string } = {}): InvoiceTeacherViewDto {
  return {
    id: inv._id.toString(),
    code: inv.code,
    kind: inv.kind,
    studentId: inv.studentId.toString(),
    classId: inv.classId?.toString() ?? null,
    balance: inv.balance,
    dueDate: toDateOnly(inv.dueDate),
    status: inv.status,
    overdue: isOverdue(inv, now),
    ...names,
  };
}

export type PaymentLean = Payment & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toPaymentDto(p: PaymentLean): PaymentDto {
  return {
    id: p._id.toString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    code: p.code,
    invoiceId: p.invoiceId.toString(),
    studentId: p.studentId.toString(),
    amount: p.amount,
    method: p.method,
    paidAt: p.paidAt.toISOString(),
    note: p.note ?? null,
    status: p.status,
    voidReason: p.voidReason ?? null,
    voidedBy: p.voidedBy?.toString() ?? null,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    recordedBy: p.recordedBy?.toString() ?? '',
  };
}
