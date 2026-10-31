import { Module } from '@nestjs/common';
import { INVOICE_CREATOR } from '../../common/contracts/invoice-creator';
import { InvoiceCreatorService } from './invoice-creator.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { OUTSTANDING_CHECKER } from '../../common/contracts/outstanding-checker';
import { OutstandingCheckerService } from './outstanding-checker.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// INVOICE_CREATOR / OUTSTANDING_CHECKER: global no-ops live in common/contracts (ContractsModule).
// L-FEES provides the real ones here (providers + exports); see ContractsModule for the merge wiring.
@Module({
  controllers: [InvoicesController, PaymentsController],
  providers: [InvoicesService, PaymentsService, { provide: INVOICE_CREATOR, useClass: InvoiceCreatorService },
    { provide: OUTSTANDING_CHECKER, useClass: OutstandingCheckerService },
  ],
  exports: [InvoicesService, PaymentsService, INVOICE_CREATOR, OUTSTANDING_CHECKER],
})
export class FeesModule {}
