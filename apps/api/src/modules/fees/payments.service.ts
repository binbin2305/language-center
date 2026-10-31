import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, isValidObjectId, Model, Types } from 'mongoose';
import {
  AuditAction,
  ErrorCode,
  InvoiceDto,
  InvoiceStatus,
  NotificationRefType,
  NotificationType,
  PaymentDto,
  PaymentStatus,
  RecordPaymentInput,
  VoidInvoiceInput,
  VoidPaymentInput,
  vnDay,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { Models } from '../../database/models';
import type { Invoice } from '../../database/schemas/invoice.schema';
import type { Payment } from '../../database/schemas/payment.schema';
import type { Student } from '../../database/schemas/student.schema';
import { InvoiceLean, invoiceStatus, PaymentLean, toInvoiceDto, toPaymentDto } from './fees.mapper';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    @InjectModel(Models.Payment) private readonly payments: Model<Payment>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly counters: CounterService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly notifications: NotificationsService,
  ) {}

  /** FR-FEE-04 (M, S). */
  async record(invoiceId: string, input: RecordPaymentInput, user: AuthUser): Promise<PaymentDto> {
    const oid = this.toId(invoiceId);
    const { payment, invoice } = await withTransaction(this.conn, async (s) => {
      await this.lock(oid, s);
      const inv = await this.loadInvoice(oid, s);
      if (inv.status === InvoiceStatus.VOID) throw new AppError(ErrorCode.INVOICE_VOID);
      const amountPaid = inv.amountPaid + input.amount;
      if (amountPaid > inv.finalAmount) throw new AppError(ErrorCode.PAYMENT_EXCEEDS_BALANCE);
      const now = this.clock.now();
      const period = vnDay(now).slice(0, 7).replace('-', '');
      const seq = await this.counters.next(`payment:${period}`, s);
      const [doc] = await this.payments.create(
        [
          {
            code: this.counters.formatCode('PT', period, seq, 4),
            invoiceId: oid,
            studentId: inv.studentId,
            amount: input.amount,
            method: input.method,
            paidAt: input.paidAt ? new Date(input.paidAt) : now,
            ...(input.note ? { note: input.note } : {}),
            status: PaymentStatus.VALID,
            recordedBy: user.id,
          },
        ],
        { session: s },
      );
      const after = await this.invoices
        .findOneAndUpdate(
          { _id: oid, status: { $ne: InvoiceStatus.VOID }, $expr: { $lte: [{ $add: ['$amountPaid', input.amount] }, '$finalAmount'] } },
          { $set: { amountPaid, balance: inv.finalAmount - amountPaid, status: invoiceStatus({ finalAmount: inv.finalAmount, amountPaid }) } },
          { new: true, session: s },
        )
        .lean<InvoiceLean>();
      if (!after) throw new AppError(ErrorCode.PAYMENT_EXCEEDS_BALANCE);
      await this.audit.log(
        {
          actor: user,
          action: AuditAction.CREATE,
          entity: 'payment',
          entityId: doc._id,
          after: { code: doc.code, invoiceId: oid, amount: input.amount, invoiceStatus: after.status },
        },
        s,
      );
      return { payment: doc.toObject() as unknown as PaymentLean, invoice: after };
    });
    await this.notifyRecorded(invoice, payment);
    return toPaymentDto(payment);
  }

  /** FR-FEE-05 (M): void a payment; the invoice totals and status are recomputed. */
  async voidPayment(paymentId: string, input: VoidPaymentInput, user: AuthUser): Promise<PaymentDto> {
    const reason = this.requireReason(input.reason);
    const pid = this.toId(paymentId);
    const pre = await this.payments.findById(pid, 'invoiceId').lean();
    if (!pre) throw new AppError(ErrorCode.NOT_FOUND);
    const doc = await withTransaction(this.conn, async (s) => {
      await this.lock(pre.invoiceId, s);
      const p = await this.payments.findById(pid).session(s).lean<PaymentLean>();
      if (!p) throw new AppError(ErrorCode.NOT_FOUND);
      if (p.status !== PaymentStatus.VALID) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const inv = await this.loadInvoice(p.invoiceId, s);
      const now = this.clock.now();
      const voided = await this.payments
        .findOneAndUpdate(
          { _id: pid, status: PaymentStatus.VALID },
          { $set: { status: PaymentStatus.VOIDED, voidReason: reason, voidedBy: user.id, voidedAt: now } },
          { new: true, session: s },
        )
        .lean<PaymentLean>();
      if (!voided) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const amountPaid = inv.amountPaid - p.amount;
      await this.invoices.updateOne(
        { _id: inv._id },
        { $set: { amountPaid, balance: inv.finalAmount - amountPaid, status: invoiceStatus({ finalAmount: inv.finalAmount, amountPaid }) } },
        { session: s },
      );
      await this.audit.log(
        {
          actor: user,
          action: AuditAction.STATUS,
          entity: 'payment',
          entityId: pid,
          before: { status: p.status },
          after: { status: PaymentStatus.VOIDED, reason },
        },
        s,
      );
      return voided;
    });
    return toPaymentDto(doc);
  }

  /** FR-FEE-05 (M): void an invoice that has no VALID payment. The reason goes to the audit log (R5). */
  async voidInvoice(invoiceId: string, input: VoidInvoiceInput, user: AuthUser): Promise<InvoiceDto> {
    const oid = this.toId(invoiceId);
    const doc = await withTransaction(this.conn, async (s) => {
      await this.lock(oid, s);
      const inv = await this.loadInvoice(oid, s);
      if (inv.status === InvoiceStatus.VOID) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const valid = await this.payments.countDocuments({ invoiceId: oid, status: PaymentStatus.VALID }).session(s);
      if (valid > 0 || inv.amountPaid > 0) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const after = await this.invoices
        .findOneAndUpdate({ _id: oid, amountPaid: 0, status: { $ne: InvoiceStatus.VOID } }, { $set: { status: InvoiceStatus.VOID } }, { new: true, session: s })
        .lean<InvoiceLean>();
      if (!after) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      const reason = input.reason?.trim();
      await this.audit.log(
        {
          actor: user,
          action: AuditAction.STATUS,
          entity: 'invoice',
          entityId: oid,
          before: { status: inv.status },
          after: { status: InvoiceStatus.VOID, ...(reason ? { reason } : {}) },
        },
        s,
      );
      return after;
    });
    return toInvoiceDto(doc, this.clock.now());
  }

  /** Lock-key protocol: one per-invoice key shared by payments, voids and discount decisions. */
  private async lock(invoiceId: Types.ObjectId, s: ClientSession): Promise<void> {
    await this.counters.next(`lock:invoice:${invoiceId.toString()}`, s);
  }

  private async loadInvoice(id: Types.ObjectId, s: ClientSession): Promise<InvoiceLean> {
    const inv = await this.invoices.findById(id).session(s).lean<InvoiceLean>();
    if (!inv) throw new AppError(ErrorCode.NOT_FOUND);
    return inv;
  }

  private requireReason(reason: string): string {
    const trimmed = reason.trim();
    if (!trimmed) throw new AppError(ErrorCode.REASON_REQUIRED);
    return trimmed;
  }

  private toId(id: string): Types.ObjectId {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    return new Types.ObjectId(id);
  }

  /** After commit; failures are logged only (D21). */
  private async notifyRecorded(inv: InvoiceLean, p: PaymentLean): Promise<void> {
    try {
      const st = await this.students.findById(inv.studentId, 'userId').lean();
      if (!st?.userId) return;
      await this.notifications.notify([st.userId], {
        type: NotificationType.PAYMENT_RECORDED,
        title: 'Đã ghi nhận thanh toán',
        body: `Phiếu thu ${p.code}: ${p.amount.toLocaleString('vi-VN')} đ cho hóa đơn ${inv.code}`,
        refType: NotificationRefType.INVOICE,
        refId: inv._id,
      });
    } catch (e) {
      this.logger.warn(`PAYMENT_RECORDED notify failed: ${String(e)}`);
    }
  }
}
