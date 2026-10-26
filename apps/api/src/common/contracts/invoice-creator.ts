import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';

/**
 * Creates/voids the tuition invoice of an enrollment inside the caller's transaction.
 * Consumer: L-ENROLL. Real implementation: L-FEES (see ContractsModule for how it overrides the no-op).
 */
export const INVOICE_CREATOR = Symbol('INVOICE_CREATOR');

export interface InvoiceCreator {
  createForEnrollment(enrollmentId: Types.ObjectId, s: ClientSession): Promise<void>;
  voidForEnrollment(enrollmentId: Types.ObjectId, reason: string, s: ClientSession): Promise<void>;
}

@Injectable()
export class NoopInvoiceCreator implements InvoiceCreator {
  async createForEnrollment(): Promise<void> {}
  async voidForEnrollment(): Promise<void> {}
}
