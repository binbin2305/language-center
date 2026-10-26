import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_DISCOUNT_STATUSES, ALL_INVOICE_KINDS, ALL_INVOICE_STATUSES, DiscountStatus, InvoiceKind, InvoiceStatus } from '@lc/shared';
import { Models } from '../models';
import { clockTimestamps, money, nullableRef } from './helpers';

export interface InvoiceDiscount {
  kind: 'PERCENT' | 'AMOUNT';
  value: number;
  amount: number;
  reason: string;
  status: DiscountStatus;
  requestedBy: Types.ObjectId;
  decidedBy: Types.ObjectId | null;
  decidedAt: Date | null;
}

export interface Invoice {
  code: string;
  kind: InvoiceKind;
  studentId: Types.ObjectId;
  enrollmentId: Types.ObjectId | null;
  courseId: Types.ObjectId | null;
  description?: string;
  classId: Types.ObjectId | null;
  amountDue: number;
  discount: InvoiceDiscount | null;
  finalAmount: number;
  amountPaid: number;
  balance: number;
  dueDate: Date;
  status: InvoiceStatus;
}

type KindHolder = { kind?: InvoiceKind };
const requiredFor = (kind: InvoiceKind) =>
  function (this: KindHolder) {
    return this.kind === kind;
  };

const DiscountSchema = new Schema<InvoiceDiscount>(
  {
    kind: { type: String, enum: ['PERCENT', 'AMOUNT'], required: true },
    value: money({ required: true }),
    amount: money({ required: true }),
    reason: { type: String, required: true },
    status: { type: String, enum: ALL_DISCOUNT_STATUSES, default: DiscountStatus.PENDING_APPROVAL },
    requestedBy: { type: Schema.Types.ObjectId, ref: Models.User, required: true },
    decidedBy: nullableRef(Models.User),
    decidedAt: { type: Date, default: null },
  },
  { _id: false },
);

export const InvoiceSchema = new Schema<Invoice>(
  {
    code: { type: String, required: true },
    kind: { type: String, enum: ALL_INVOICE_KINDS, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: Models.Enrollment,
      default: null,
      required: [requiredFor(InvoiceKind.TUITION), 'enrollmentId is required for TUITION'],
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: Models.Course,
      default: null,
      required: [requiredFor(InvoiceKind.TUITION), 'courseId is required for TUITION'],
    },
    description: {
      type: String,
      required: [requiredFor(InvoiceKind.SURCHARGE), 'description is required for SURCHARGE'],
    },
    classId: nullableRef(Models.Class),
    amountDue: money({ required: true }),
    discount: { type: DiscountSchema, default: null },
    finalAmount: money({ required: true }),
    amountPaid: money({ default: 0 }),
    balance: money({ required: true }),
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ALL_INVOICE_STATUSES, default: InvoiceStatus.UNPAID },
  },
  { timestamps: clockTimestamps, collection: 'invoices' },
);
InvoiceSchema.index({ code: 1 }, { unique: true });
InvoiceSchema.index({ studentId: 1, status: 1 });
InvoiceSchema.index({ dueDate: 1, status: 1 });
InvoiceSchema.index({ classId: 1 });
InvoiceSchema.index(
  { enrollmentId: 1 },
  { unique: true, partialFilterExpression: { kind: InvoiceKind.TUITION } },
);

export type InvoiceDoc = HydratedDocument<Invoice>;
