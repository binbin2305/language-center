import { Connection } from 'mongoose';
import { InvoiceKind, InvoiceStatus, PaymentMethod } from '@lc/shared';
import type { Invoice, InvoiceDoc } from '../../src/database/schemas/invoice.schema';
import type { Payment, PaymentDoc } from '../../src/database/schemas/payment.schema';
import { makeEnrollment } from './academic.factory';
import { makeCourse } from './catalog.factory';
import { models, seq } from './common';
import { makeStudent } from './student.factory';

export async function makeInvoice(conn: Connection, p: Partial<Invoice> = {}): Promise<InvoiceDoc> {
  const n = seq();
  const kind = p.kind ?? InvoiceKind.TUITION;
  const studentId = p.studentId ?? (await makeStudent(conn))._id;
  const base = { code: `HD199901${String(n).padStart(4, '0')}`, kind, studentId, dueDate: new Date('2026-01-12T00:00:00+07:00') };
  if (kind === InvoiceKind.SURCHARGE) {
    const amountDue = p.amountDue ?? 200_000;
    const finalAmount = p.finalAmount ?? amountDue;
    return models(conn).Invoice.create({
      ...base,
      description: 'Phí giáo trình',
      amountDue,
      finalAmount,
      amountPaid: 0,
      balance: finalAmount,
      status: InvoiceStatus.UNPAID,
      ...p,
    });
  }
  const courseId = p.courseId ?? (await makeCourse(conn))._id;
  const course = await models(conn).Course.findById(courseId);
  const enrollmentId = p.enrollmentId ?? (await makeEnrollment(conn, { studentId, courseId }))._id;
  const amountDue = p.amountDue ?? course?.baseFee ?? 3_000_000;
  const finalAmount = p.finalAmount ?? amountDue;
  const invoice = await models(conn).Invoice.create({
    ...base,
    courseId,
    enrollmentId,
    amountDue,
    finalAmount,
    amountPaid: 0,
    balance: finalAmount,
    status: InvoiceStatus.UNPAID,
    ...p,
  });
  await models(conn).Enrollment.updateOne({ _id: enrollmentId }, { invoiceId: invoice._id });
  return invoice;
}

/** Creates a payment document only; it does not update the invoice totals. */
export async function makePayment(conn: Connection, p: Partial<Payment> = {}): Promise<PaymentDoc> {
  const n = seq();
  const invoice = p.invoiceId ? await models(conn).Invoice.findById(p.invoiceId) : await makeInvoice(conn);
  if (!invoice) throw new Error('makePayment: invoice not found');
  return models(conn).Payment.create({
    code: `PT199901${String(n).padStart(4, '0')}`,
    invoiceId: invoice._id,
    studentId: invoice.studentId,
    amount: 1_000_000,
    method: PaymentMethod.CASH,
    paidAt: new Date('2026-01-05T02:00:00Z'),
    ...p,
  });
}
