import { Types } from 'mongoose';
import { InvoiceDto, InvoiceStatus, toDateOnly, vnDay } from '@lc/shared';
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
    overdue: toDateOnly(inv.dueDate) < vnDay(now) && inv.balance > 0 && inv.status !== InvoiceStatus.VOID,
    ...names,
  };
}
