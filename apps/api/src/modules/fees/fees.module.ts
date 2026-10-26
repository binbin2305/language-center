import { Module } from '@nestjs/common';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';

// INVOICE_CREATOR / OUTSTANDING_CHECKER: global no-ops live in common/contracts (ContractsModule).
// L-FEES provides the real ones here (providers + exports); see ContractsModule for the merge wiring.
@Module({
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
