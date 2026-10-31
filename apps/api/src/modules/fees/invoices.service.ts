import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, isValidObjectId, Model, Types } from 'mongoose';
import {
  ApplyDiscountInput,
  applyDiscount,
  AuditAction,
  DecideDiscountInput,
  DiscountStatus,
  ErrorCode,
  InvoiceDto,
  InvoiceStatus,
  isValidDiscount,
  ListInvoicesQuery,
  NotificationRefType,
  NotificationType,
  Paginated,
  Role,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { paginate } from '../../common/pagination';
import { Models } from '../../database/models';
import type { Invoice } from '../../database/schemas/invoice.schema';
import type { Student } from '../../database/schemas/student.schema';
import { InvoiceLean, toInvoiceDto } from './fees.mapper';

const SORTABLE = new Set(['createdAt', 'dueDate', 'code', 'finalAmount']);

function statusFor(finalAmount: number, balance: number, paid: number): InvoiceStatus {
  if (finalAmount === 0 || balance === 0) return InvoiceStatus.PAID;
  return paid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID;
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly counters: CounterService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly notifications: NotificationsService,
  ) {}

  /** FR-FEE-03: S proposes (PENDING_APPROVAL), M applies directly (APPROVED). */
  async applyDiscount(id: string, input: ApplyDiscountInput, user: AuthUser): Promise<InvoiceDto> {
    const oid = this.toId(id);
    const doc = await withTransaction(this.conn, async (s) => {
      // Lock-key protocol: serialise discount writes on this invoice before reading its invariants.
      await this.counters.next(`lock:invoice-discount:${oid.toString()}`, s);
      const inv = await this.loadForDiscount(oid, s);
      if (inv.discount && inv.discount.status !== DiscountStatus.REJECTED) {
        throw new AppError(ErrorCode.DISCOUNT_NOT_PENDING);
      }
      const amount = this.discountAmount(inv, input);
      const now = this.clock.now();
      const direct = user.role === Role.MANAGER;
      const discount = {
        kind: input.kind,
        value: input.value,
        amount,
        reason: input.reason,
        status: direct ? DiscountStatus.APPROVED : DiscountStatus.PENDING_APPROVAL,
        requestedBy: user.id,
        decidedBy: direct ? user.id : null,
        decidedAt: direct ? now : null,
      };
      const set: Record<string, unknown> = { discount };
      if (direct) Object.assign(set, this.totals(inv, inv.amountDue - amount));
      const cond = inv.discount ? { 'discount.status': DiscountStatus.REJECTED } : { discount: null };
      const after = await this.invoices
        .findOneAndUpdate({ _id: oid, status: { $ne: InvoiceStatus.VOID }, ...cond }, { $set: set }, { new: true, session: s })
        .lean<InvoiceLean>();
      if (!after) throw new AppError(ErrorCode.DISCOUNT_NOT_PENDING);
      await this.audit.log(
        { actor: user, action: AuditAction.UPDATE, entity: 'invoice', entityId: oid, before: this.snapshot(inv), after: this.snapshot(after) },
        s,
      );
      return after;
    });
    return this.dto(doc);
  }

  /** FR-FEE-03: M approves / rejects a pending proposal. */
  async decideDiscount(id: string, input: DecideDiscountInput, user: AuthUser): Promise<InvoiceDto> {
    const oid = this.toId(id);
    const doc = await withTransaction(this.conn, async (s) => {
      await this.counters.next(`lock:invoice-discount:${oid.toString()}`, s);
      const inv = await this.loadForDiscount(oid, s);
      if (inv.discount?.status !== DiscountStatus.PENDING_APPROVAL) throw new AppError(ErrorCode.DISCOUNT_NOT_PENDING);
      const now = this.clock.now();
      const set: Record<string, unknown> = {
        'discount.status': input.approve ? DiscountStatus.APPROVED : DiscountStatus.REJECTED,
        'discount.decidedBy': user.id,
        'discount.decidedAt': now,
      };
      if (input.approve) {
        // Payments may have landed since the proposal: re-validate against amountPaid.
        const amount = this.discountAmount(inv, inv.discount);
        set['discount.amount'] = amount;
        Object.assign(set, this.totals(inv, inv.amountDue - amount));
      }
      const after = await this.invoices
        .findOneAndUpdate(
          { _id: oid, status: { $ne: InvoiceStatus.VOID }, 'discount.status': DiscountStatus.PENDING_APPROVAL },
          { $set: set },
          { new: true, session: s },
        )
        .lean<InvoiceLean>();
      if (!after) throw new AppError(ErrorCode.DISCOUNT_NOT_PENDING);
      await this.audit.log(
        {
          actor: user,
          action: AuditAction.STATUS,
          entity: 'invoice',
          entityId: oid,
          before: this.snapshot(inv),
          after: { ...this.snapshot(after), ...(input.note ? { note: input.note } : {}) },
        },
        s,
      );
      return after;
    });
    await this.notifyDecided(doc, input.approve);
    return this.dto(doc);
  }

  /** GET /invoices/discounts/pending — approval queue. */
  async pendingDiscounts(q: ListInvoicesQuery): Promise<Paginated<InvoiceDto>> {
    if (q.sort && !q.sort.split(',').every((k) => SORTABLE.has(k.trim().replace(/^[-+]/, '')))) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { sort: 'Trường sắp xếp không hợp lệ' });
    }
    const page = await paginate(this.invoices, { 'discount.status': DiscountStatus.PENDING_APPROVAL }, { ...q, sort: q.sort ?? '-createdAt' });
    const rows = page.data as unknown as InvoiceLean[];
    const students = await this.students.find({ _id: { $in: rows.map((r) => r.studentId) } }, { fullName: 1, code: 1 }).lean();
    const byId = new Map(students.map((x) => [String(x._id), x]));
    const now = this.clock.now();
    return {
      data: rows.map((r) => {
        const st = byId.get(String(r.studentId));
        return toInvoiceDto(r, now, { studentName: st?.fullName, studentCode: st?.code });
      }),
      meta: page.meta,
    };
  }

  private toId(id: string): Types.ObjectId {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    return new Types.ObjectId(id);
  }

  private async loadForDiscount(oid: Types.ObjectId, s: ClientSession): Promise<InvoiceLean> {
    const inv = await this.invoices.findById(oid).session(s).lean<InvoiceLean>();
    if (!inv) throw new AppError(ErrorCode.NOT_FOUND);
    if (inv.status === InvoiceStatus.VOID) throw new AppError(ErrorCode.INVOICE_VOID);
    return inv;
  }

  /** Discount in VND; DISCOUNT_INVALID (400) when malformed or it would drop finalAmount below amountPaid. */
  private discountAmount(inv: InvoiceLean, d: { kind: 'PERCENT' | 'AMOUNT'; value: number }): number {
    const dd = { kind: d.kind, value: d.value };
    if (!isValidDiscount(inv.amountDue, dd)) throw new AppError(ErrorCode.DISCOUNT_INVALID, 400);
    const amount = inv.amountDue - applyDiscount(inv.amountDue, dd);
    if (inv.amountDue - amount < inv.amountPaid) throw new AppError(ErrorCode.DISCOUNT_INVALID, 400);
    return amount;
  }

  private totals(inv: InvoiceLean, finalAmount: number) {
    const balance = finalAmount - inv.amountPaid;
    return { finalAmount, balance, status: statusFor(finalAmount, balance, inv.amountPaid) };
  }

  private snapshot(inv: InvoiceLean) {
    return { discount: inv.discount, finalAmount: inv.finalAmount, balance: inv.balance, status: inv.status };
  }

  private dto(doc: InvoiceLean): InvoiceDto {
    return toInvoiceDto(doc, this.clock.now());
  }

  /** After commit; failures are logged only (D21). */
  private async notifyDecided(inv: InvoiceLean, approved: boolean): Promise<void> {
    const to = inv.discount?.requestedBy;
    if (!to) return;
    try {
      await this.notifications.notify([to], {
        type: NotificationType.DISCOUNT_DECIDED,
        title: approved ? 'Giảm giá được duyệt' : 'Giảm giá bị từ chối',
        body: `Hóa đơn ${inv.code}: đề xuất giảm giá ${approved ? 'đã được duyệt' : 'bị từ chối'}`,
        refType: NotificationRefType.INVOICE,
        refId: inv._id,
      });
    } catch (e) {
      this.logger.warn(`DISCOUNT_DECIDED notify failed: ${String(e)}`);
    }
  }
}
