import { Module } from '@nestjs/common';
import { INVOICE_CREATOR } from '../../common/contracts/invoice-creator';
import { InvoiceCreatorService } from './invoice-creator.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

// INVOICE_CREATOR / OUTSTANDING_CHECKER: global no-ops live in common/contracts (ContractsModule).
// L-FEES provides the real ones here (providers + exports); see ContractsModule for the merge wiring.
@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, { provide: INVOICE_CREATOR, useClass: InvoiceCreatorService }],
  exports: [InvoicesService, INVOICE_CREATOR],
})
export class FeesModule {}
