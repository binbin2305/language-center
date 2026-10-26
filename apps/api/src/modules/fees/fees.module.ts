import { Module } from '@nestjs/common';
import { INVOICE_CREATOR } from '../enrollments/invoice-creator';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { NoopInvoiceCreator } from './noop-invoice-creator';

@Module({
  controllers: [FeesController],
  providers: [FeesService, { provide: INVOICE_CREATOR, useClass: NoopInvoiceCreator }],
  exports: [FeesService, INVOICE_CREATOR],
})
export class FeesModule {}
