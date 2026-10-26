import type { ClientSession, Types } from 'mongoose';

/** DI token: enrollments depend on this contract; FeesModule provides the implementation. */
export const INVOICE_CREATOR = Symbol('INVOICE_CREATOR');

export interface InvoiceCreator {
  createForEnrollment(enrollmentId: Types.ObjectId, s: ClientSession): Promise<void>;
  voidForEnrollment(enrollmentId: Types.ObjectId, reason: string, s: ClientSession): Promise<void>;
}
