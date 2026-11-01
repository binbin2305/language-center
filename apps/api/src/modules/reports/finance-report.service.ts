import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { InvoiceStatus, PaymentStatus, type FinanceReportDto, type FinanceReportQuery } from '@lc/shared';
import { ClockService } from '../../common/clock/clock.service';
import { Models } from '../../database/models';
import type { Class } from '../../database/schemas/class.schema';
import type { Course } from '../../database/schemas/course.schema';
import type { Invoice } from '../../database/schemas/invoice.schema';
import type { Payment } from '../../database/schemas/payment.schema';
import { overdueFilter } from '../fees/fees.mapper';
import { vnRange } from './report-range';

type Totals = FinanceReportDto['totals'];
type Row = FinanceReportDto['rows'][number];
const zero = (): Totals => ({ revenue: 0, totalDue: 0, outstanding: 0, overdue: 0, totalDiscount: 0 });
const NONE = 'none';

/** '2026-10' → 'Tháng 10/2026'. */
const monthLabel = (key: string) => `Tháng ${key.slice(5, 7)}/${key.slice(0, 4)}`;

/** FR-RPT-04 (D26). Read-only aggregation over invoices and payments. */
@Injectable()
export class FinanceReportService {
  constructor(
    private readonly clock: ClockService,
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    @InjectModel(Models.Payment) private readonly payments: Model<Payment>,
    @InjectModel(Models.Course) private readonly courses: Model<Course>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
  ) {}

  async get(q: FinanceReportQuery): Promise<FinanceReportDto> {
    const { start, end } = vnRange(q.from, q.to);
    const now = this.clock.now();
    const inv = {
      ...(q.courseId && { courseId: new Types.ObjectId(q.courseId) }),
      ...(q.classId && { classId: new Types.ObjectId(q.classId) }),
    };
    const base = { ...inv, status: { $ne: InvoiceStatus.VOID }, createdAt: { $gte: start, $lt: end } };
    const bucket = (date: string, field: 'courseId' | 'classId'): unknown =>
      q.groupBy === 'month' ? { $dateToString: { format: '%Y-%m', date, timezone: '+07:00' } } : { $ifNull: [`$${field}`, NONE] };

    const invoiceGroup = (match: Record<string, unknown>, sums: Record<string, unknown>): PipelineStage[] => [
      { $match: match },
      { $group: { _id: bucket('$createdAt', q.groupBy === 'class' ? 'classId' : 'courseId'), ...sums } },
    ];
    const [main, overdue, pay] = await Promise.all([
      this.invoices.aggregate<{ _id: unknown; totalDue: number; outstanding: number; totalDiscount: number }>(
        invoiceGroup(base, {
          totalDue: { $sum: '$finalAmount' },
          outstanding: { $sum: '$balance' },
          totalDiscount: { $sum: { $cond: [{ $eq: ['$discount.status', 'APPROVED'] }, '$discount.amount', 0] } },
        }),
      ),
      this.invoices.aggregate<{ _id: unknown; overdue: number }>(invoiceGroup({ ...base, ...overdueFilter(now) }, { overdue: { $sum: '$balance' } })),
      this.payments.aggregate<{ _id: unknown; revenue: number }>([
        { $match: { status: PaymentStatus.VALID, paidAt: { $gte: start, $lt: end } } },
        { $lookup: { from: this.invoices.collection.name, localField: 'invoiceId', foreignField: '_id', as: 'inv' } },
        { $unwind: '$inv' },
        ...(Object.keys(inv).length ? [{ $match: Object.fromEntries(Object.entries(inv).map(([k, v]) => [`inv.${k}`, v])) }] : []),
        {
          $group: {
            _id:
              q.groupBy === 'month'
                ? { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: '+07:00' } }
                : { $ifNull: [q.groupBy === 'class' ? '$inv.classId' : '$inv.courseId', NONE] },
            revenue: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const acc = new Map<string, Totals>();
    const at = (k: unknown) => {
      const key = String(k);
      if (!acc.has(key)) acc.set(key, zero());
      return acc.get(key)!;
    };
    for (const r of main) Object.assign(at(r._id), { totalDue: r.totalDue, outstanding: r.outstanding, totalDiscount: r.totalDiscount });
    for (const r of overdue) at(r._id).overdue = r.overdue;
    for (const r of pay) at(r._id).revenue = r.revenue;

    const labels = await this.labels(q.groupBy, [...acc.keys()]);
    const rows: Row[] = [...acc.entries()]
      .map(([key, v]) => ({ key, label: labels.get(key) ?? (key === NONE ? 'Khác' : q.groupBy === 'month' ? monthLabel(key) : key), ...v }))
      .sort((a, b) => (q.groupBy === 'month' ? a.key.localeCompare(b.key) : a.label.localeCompare(b.label)));
    const totals = rows.reduce<Totals>((s, r) => {
      for (const k of Object.keys(s) as (keyof Totals)[]) s[k] += r[k];
      return s;
    }, zero());
    return { totals, rows };
  }

  private async labels(groupBy: FinanceReportQuery['groupBy'], keys: string[]): Promise<Map<string, string>> {
    if (groupBy === 'month') return new Map();
    const ids = keys.filter((k) => k !== NONE).map((k) => new Types.ObjectId(k));
    if (groupBy === 'course') return new Map((await this.courses.find({ _id: { $in: ids } }, { name: 1 }).lean()).map((c) => [c._id.toString(), c.name]));
    return new Map((await this.classes.find({ _id: { $in: ids } }, { code: 1 }).lean()).map((c) => [c._id.toString(), c.code]));
  }
}
