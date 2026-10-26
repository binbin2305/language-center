import { Injectable } from '@nestjs/common';
import type { InvoiceCreator } from '../enrollments/invoice-creator';

/** Placeholder until the fees lane (W2) supplies the real implementation. */
@Injectable()
export class NoopInvoiceCreator implements InvoiceCreator {
  async createForEnrollment(): Promise<void> {}
  async voidForEnrollment(): Promise<void> {}
}
