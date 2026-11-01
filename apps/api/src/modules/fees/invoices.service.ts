import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, isValidObjectId, Model, Types } from 'mongoose';
import {
  ApplyDiscountInput,
  applyDiscount,
  AuditAction,
  DecideDiscountInput,
  Discount,
  DiscountStatus,
  ErrorCode,
  InvoiceDto,
  InvoiceStatus,
  isValidDiscount,
  ListInvoicesQuery,
  NotificationRefType,
  NotificationType,
  CreateInvoiceInput,
  fromDateOnly,
  InvoiceDetailDto,
  InvoiceKind,
  InvoiceTeacherViewDto,
  Paginated,
  Role,
  vnDay,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { paginate } from '../../common/pagination';
import { ScopeService } from '../../common/scope/scope.service';
import { Models } from '../../database/models';
import type { Invoice } from '../../database/schemas/invoice.schema';
import type { Payment } from '../../database/schemas/payment.schema';
import type { Student } from '../../database/schemas/student.schema';
import { InvoiceLean, invoiceStatus, overdueFilter, toInvoiceDto, toInvoiceTeacherView, toPaymentDto, PaymentLean } from './fees.mapper';

const SORTABLE = new Set(['createdAt', 'dueDate', 'code', 'finalAmount']);

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    @InjectModel(Models.Payment) private readonly payments: Model<Payment>,
    private readonly scope: ScopeService,
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
      await this.counters.next(`lock:invoice:${oid.toString()}`, s);
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
      await this.counters.next(`lock:invoice:${oid.toString()}`, s);
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

  /** FR-FEE-06: M/S all; T their students (teacher view); H own. */
  async list(q: ListInvoicesQuery, user: AuthUser): Promise<Paginated<InvoiceDto | InvoiceTeacherViewDto>> {
    if (q.sort && !q.sort.split(',').every((k) => SORTABLE.has(k.trim().replace(/^[-+]/, '')))) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { sort: 'Trường sắp xếp không hợp lệ' });
    }
    const now = this.clock.now();
    const and: Record<string, unknown>[] = [];
    const visible = await this.visibleStudents(user);
    if (visible) and.push({ studentId: { $in: visible } });
    if (q.studentId) and.push({ studentId: new Types.ObjectId(q.studentId) });
    if (q.classId) and.push({ classId: new Types.ObjectId(q.classId) });
    if (q.status) and.push({ status: q.status });
    if (q.kind) and.push({ kind: q.kind });
    if (q.overdue) and.push(overdueFilter(now));
    const due: Record<string, Date> = {};
    if (q.from) due.$gte = fromDateOnly(q.from);
    if (q.to) due.$lte = fromDateOnly(q.to);
    if (q.from || q.to) and.push({ dueDate: due });
    const page = await paginate(this.invoices, and.length ? { $and: and } : {}, { ...q, sort: q.sort ?? '-createdAt' });
    const rows = page.data as unknown as InvoiceLean[];
    const names = await this.studentNames(rows.map((r) => r.studentId));
    const teacher = user.role === Role.TEACHER;
    return {
      data: rows.map((r) => (teacher ? toInvoiceTeacherView(r, now, names.get(String(r.studentId))) : toInvoiceDto(r, now, names.get(String(r.studentId))))),
      meta: page.meta,
    };
  }

  /** FR-FEE-06: out of scope is 404. */
  async get(id: string, user: AuthUser): Promise<InvoiceDetailDto | InvoiceTeacherViewDto> {
    const oid = this.toId(id);
    const inv = await this.invoices.findById(oid).lean<InvoiceLean>();
    if (!inv) throw new AppError(ErrorCode.NOT_FOUND);
    const visible = await this.visibleStudents(user);
    if (visible && !visible.some((v) => v.equals(inv.studentId))) throw new AppError(ErrorCode.NOT_FOUND);
    const now = this.clock.now();
    const names = (await this.studentNames([inv.studentId])).get(String(inv.studentId));
    if (user.role === Role.TEACHER) return toInvoiceTeacherView(inv, now, names);
    const pays = await this.payments.find({ invoiceId: oid }).sort({ paidAt: 1, _id: 1 }).lean<PaymentLean[]>();
    return { ...toInvoiceDto(inv, now, names), payments: pays.map(toPaymentDto) };
  }

  /** FR-FEE-07: manual SURCHARGE invoice. */
  async createSurcharge(input: CreateInvoiceInput, user: AuthUser): Promise<InvoiceDto> {
    const studentId = new Types.ObjectId(input.studentId);
    if (!(await this.students.exists({ _id: studentId }))) throw new AppError(ErrorCode.NOT_FOUND);
    const doc = await withTransaction(this.conn, async (s) => {
      const now = this.clock.now();
      const period = vnDay(now).slice(0, 7).replace('-', '');
      const seq = await this.counters.next(`invoice:${period}`, s);
      const [created] = await this.invoices.create(
        [
          {
            code: this.counters.formatCode('HD', period, seq, 4),
            kind: InvoiceKind.SURCHARGE,
            studentId,
            ...(input.enrollmentId ? { enrollmentId: new Types.ObjectId(input.enrollmentId) } : {}),
            ...(input.courseId ? { courseId: new Types.ObjectId(input.courseId) } : {}),
            ...(input.classId ? { classId: new Types.ObjectId(input.classId) } : {}),
            description: input.description,
            amountDue: input.amountDue,
            finalAmount: input.amountDue,
            amountPaid: 0,
            balance: input.amountDue,
            dueDate: fromDateOnly(input.dueDate),
            status: input.amountDue === 0 ? InvoiceStatus.PAID : InvoiceStatus.UNPAID,
          },
        ],
        { session: s },
      );
      await this.audit.log(
        { actor: user, action: AuditAction.CREATE, entity: 'invoice', entityId: created._id, after: { code: created.code, kind: InvoiceKind.SURCHARGE, amountDue: input.amountDue } },
        s,
      );
      return created.toObject() as unknown as InvoiceLean;
    });
    return this.dto(doc);
  }

  /** Student ids the user may see; null = unrestricted (M, S). */
  private async visibleStudents(user: AuthUser): Promise<Types.ObjectId[] | null> {
    if (user.role === Role.TEACHER) return this.scope.teacherCurrentStudentIds(user.id); // R9: current students only
    if (user.role === Role.STUDENT) return user.studentId ? [user.studentId] : [];
    return null;
  }

  private async studentNames(ids: Types.ObjectId[]): Promise<Map<string, { studentName: string; studentCode: string }>> {
    const rows = await this.students.find({ _id: { $in: ids } }, { fullName: 1, code: 1 }).lean();
    return new Map(rows.map((x) => [String(x._id), { studentName: x.fullName, studentCode: x.code }]));
  }

  /** GET /invoices/discounts/pending — approval queue. */
  async pendingDiscounts(q: ListInvoicesQuery): Promise<Paginated<InvoiceDto>> {
    if (q.sort && !q.sort.split(',').every((k) => SORTABLE.has(k.trim().replace(/^[-+]/, '')))) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 400, { sort: 'Trường sắp xếp không hợp lệ' });
    }
    const page = await paginate(this.invoices, { 'discount.status': DiscountStatus.PENDING_APPROVAL, status: { $ne: InvoiceStatus.VOID } }, { ...q, sort: q.sort ?? '-createdAt' });
    const rows = page.data as unknown as InvoiceLean[];
    const names = await this.studentNames(rows.map((r) => r.studentId));
    const now = this.clock.now();
    return {
      data: rows.map((r) => toInvoiceDto(r, now, names.get(String(r.studentId)))),
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
  private discountAmount(inv: InvoiceLean, d: Discount): number {
    const dd: Discount = { kind: d.kind, value: d.value };
    if (!isValidDiscount(inv.amountDue, dd)) throw new AppError(ErrorCode.DISCOUNT_INVALID);
    const amount = inv.amountDue - applyDiscount(inv.amountDue, dd);
    if (inv.amountDue - amount < inv.amountPaid) throw new AppError(ErrorCode.DISCOUNT_INVALID);
    return amount;
  }

  private totals(inv: InvoiceLean, finalAmount: number) {
    const balance = finalAmount - inv.amountPaid;
    return { finalAmount, balance, status: invoiceStatus({ finalAmount, amountPaid: inv.amountPaid }) };
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
