import { Module } from '@nestjs/common';
import { INVOICE_CREATOR } from '../../common/contracts/invoice-creator';
import { FeesController } from './fees.controller';
import { InvoiceCreatorService } from './invoice-creator.service';
import { FeesService } from './fees.service';

// INVOICE_CREATOR / OUTSTANDING_CHECKER: global no-ops live in common/contracts (ContractsModule).
// L-FEES provides the real ones here (providers + exports); see ContractsModule for the merge wiring.
@Module({
  controllers: [FeesController],
  providers: [FeesService, { provide: INVOICE_CREATOR, useClass: InvoiceCreatorService }],
  exports: [FeesService, INVOICE_CREATOR],
})
export class FeesModule {}
