import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { addVnDays, fromDateOnly, InvoiceKind, InvoiceStatus, toDateOnly, vnDay } from '@lc/shared';
import { ClockService } from '../../common/clock/clock.service';
import type { InvoiceCreator } from '../../common/contracts/invoice-creator';
import { CounterService } from '../../common/db/counter.service';
import { SettingsService } from '../../common/settings/settings.service';
import { isDuplicateKey } from '../../common/util/is-duplicate-key';
import { Models } from '../../database/models';
import type { Class } from '../../database/schemas/class.schema';
import type { Course } from '../../database/schemas/course.schema';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { Invoice } from '../../database/schemas/invoice.schema';

/** Real INVOICE_CREATOR (D11): one TUITION invoice per enrollment chain (`transferredFromId`). */
@Injectable()
export class InvoiceCreatorService implements InvoiceCreator {
  constructor(
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Course) private readonly courses: Model<Course>,
    private readonly counters: CounterService,
    private readonly settings: SettingsService,
    private readonly clock: ClockService,
  ) {}

  async createForEnrollment(enrollmentId: Types.ObjectId, s: ClientSession): Promise<Types.ObjectId | null> {
    // Lock-key protocol: serialise concurrent creators of the same enrollment before reading.
    await this.counters.next(`lock:invoice:${enrollmentId.toString()}`, s);
    const existing = await this.findChainInvoice(enrollmentId, s);
    if (existing) return existing._id;

    const enr = await this.enrollments.findById(enrollmentId).session(s).lean();
    if (!enr) return null;
    // Sequential: no parallel operations on the same ClientSession.
    const course = await this.courses.findById(enr.courseId).session(s).lean();
    const cls = enr.classId ? await this.classes.findById(enr.classId).session(s).lean() : null;
    const settings = await this.settings.get();
    if (!course) return null;

    const now = this.clock.now();
    const period = vnDay(now).slice(0, 7).replace('-', '');
    const seq = await this.counters.next(`invoice:${period}`, s);
    const code = this.counters.formatCode('HD', period, seq, 4);
    const start = cls ? toDateOnly(cls.startDate) : vnDay(now);
    const dueDate = fromDateOnly(addVnDays(start, settings.invoiceDueDaysAfterStart));
    const fee = course.baseFee;
    try {
      const [doc] = await this.invoices.create(
        [
          {
            code,
            kind: InvoiceKind.TUITION,
            studentId: enr.studentId,
            enrollmentId,
            courseId: enr.courseId,
            classId: cls?._id ?? null,
            amountDue: fee,
            finalAmount: fee,
            amountPaid: 0,
            balance: fee,
            dueDate,
            status: fee === 0 ? InvoiceStatus.PAID : InvoiceStatus.UNPAID,
          },
        ],
        { session: s },
      );
      return doc._id;
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
      // Inside a transaction the loser is retried by withTransaction and then finds the winner's invoice.
      (e as { addErrorLabel?: (l: string) => void }).addErrorLabel?.('TransientTransactionError');
      throw e;
    }
  }

  async voidForEnrollment(enrollmentId: Types.ObjectId, reason: string, s: ClientSession): Promise<void> {
    const inv = await this.findChainInvoice(enrollmentId, s);
    if (!inv || inv.status === InvoiceStatus.VOID || inv.amountPaid > 0) return;
    // voidReason is not in the Invoice schema yet (docs/contract-requests/L-FEES-1.md).
    await this.invoices.updateOne({ _id: inv._id }, { $set: { status: InvoiceStatus.VOID, voidReason: reason } }, { session: s, strict: false });
  }

  /** enrollment.invoiceId -> invoices{enrollmentId, TUITION} -> follow transferredFromId. */
  private async findChainInvoice(enrollmentId: Types.ObjectId, s: ClientSession): Promise<{ _id: Types.ObjectId; status: InvoiceStatus; amountPaid: number } | null> {
    const seen = new Set<string>();
    let cur: Types.ObjectId | null = enrollmentId;
    while (cur && !seen.has(cur.toString())) {
      seen.add(cur.toString());
      const enr: Pick<Enrollment, 'invoiceId' | 'transferredFromId'> | null = await this.enrollments.findById(cur, 'invoiceId transferredFromId').session(s).lean();
      if (enr?.invoiceId) {
        const byId = await this.invoices.findById(enr.invoiceId, 'status amountPaid').session(s).lean();
        if (byId) return byId;
      }
      const byEnr = await this.invoices.findOne({ enrollmentId: cur, kind: InvoiceKind.TUITION }, 'status amountPaid').session(s).lean();
      if (byEnr) return byEnr;
      cur = enr?.transferredFromId ?? null;
    }
    return null;
  }
}
