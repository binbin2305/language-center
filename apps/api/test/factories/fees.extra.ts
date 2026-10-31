import { Connection } from 'mongoose';
import { InvoiceStatus, PaymentStatus } from '@lc/shared';
import { models } from './common';

function expectedStatus(finalAmount: number, balance: number): InvoiceStatus {
  if (finalAmount === 0 || balance === 0) return InvoiceStatus.PAID;
  return balance === finalAmount ? InvoiceStatus.UNPAID : InvoiceStatus.PARTIAL;
}

/** Throws when any non-VOID invoice breaks the BACKEND_SCHEMA §2.16 invariants. */
export async function assertInvoiceInvariants(conn: Connection): Promise<void> {
  const m = models(conn);
  const invoices = await m.Invoice.find().lean();
  for (const inv of invoices) {
    if (inv.status === InvoiceStatus.VOID) continue;
    const paid = await m.Payment.aggregate<{ total: number }>([
      { $match: { invoiceId: inv._id, status: PaymentStatus.VALID } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const sum = paid[0]?.total ?? 0;
    const fail = (msg: string) => {
      throw new Error(`Invoice ${inv.code} invariant broken: ${msg}`);
    };
    if (inv.amountPaid > inv.finalAmount) fail('amountPaid > finalAmount');
    if (inv.balance !== inv.finalAmount - inv.amountPaid) fail('balance != finalAmount - amountPaid');
    if (inv.amountPaid !== sum) fail(`amountPaid ${inv.amountPaid} != sum(VALID payments) ${sum}`);
    if (inv.status !== expectedStatus(inv.finalAmount, inv.balance)) fail(`status ${inv.status} mismatches`);
  }
}
