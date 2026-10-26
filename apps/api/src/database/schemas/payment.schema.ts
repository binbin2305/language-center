import { HydratedDocument, Schema, Types } from 'mongoose';
import { ALL_PAYMENT_METHODS, ALL_PAYMENT_STATUSES, PaymentMethod, PaymentStatus } from '@lc/shared';
import { Models } from '../models';
import { clockTimestamps, money } from './helpers';

export interface Payment {
  code: string;
  invoiceId: Types.ObjectId;
  studentId: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  note?: string;
  status: PaymentStatus;
  voidReason?: string;
  voidedBy?: Types.ObjectId;
  voidedAt?: Date;
  recordedBy?: Types.ObjectId;
}

export const PaymentSchema = new Schema<Payment>(
  {
    code: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: Models.Invoice, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: Models.Student, required: true },
    amount: money({ required: true, min: 1 }),
    method: { type: String, enum: ALL_PAYMENT_METHODS, required: true },
    paidAt: { type: Date, required: true },
    note: { type: String },
    status: { type: String, enum: ALL_PAYMENT_STATUSES, default: PaymentStatus.VALID },
    voidReason: { type: String },
    voidedBy: { type: Schema.Types.ObjectId, ref: Models.User },
    voidedAt: { type: Date },
    recordedBy: { type: Schema.Types.ObjectId, ref: Models.User },
  },
  { timestamps: clockTimestamps, collection: 'payments' },
);
PaymentSchema.index({ code: 1 }, { unique: true });
PaymentSchema.index({ invoiceId: 1 });
PaymentSchema.index({ paidAt: 1, status: 1 });

export type PaymentDoc = HydratedDocument<Payment>;
