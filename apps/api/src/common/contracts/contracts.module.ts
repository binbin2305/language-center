import { Global, Module } from '@nestjs/common';
import { INVOICE_CREATOR, NoopInvoiceCreator } from './invoice-creator';
import { NoopOutstandingChecker, OUTSTANDING_CHECKER } from './outstanding-checker';
import { NoopScheduleConflictChecker, SCHEDULE_CONFLICT_CHECKER } from './schedule-conflict-checker';

/**
 * Cross-lane DI contracts (Lead-owned). Every token has a global no-op so consumers work before
 * the owning lane lands:
 *   INVOICE_CREATOR, OUTSTANDING_CHECKER  -> implemented by L-FEES      (FeesModule)
 *   SCHEDULE_CONFLICT_CHECKER             -> implemented by L-SCHEDULE  (ScheduleModule)
 *
 * How the real implementation replaces the no-op:
 *   1. The owning lane adds `{ provide: TOKEN, useClass: RealImpl }` to its own module's providers
 *      and lists TOKEN in that module's exports. It does not edit this directory.
 *   2. Lead wiring at merge: each consumer module adds the owning module to its `imports`
 *      (e.g. EnrollmentsModule imports FeesModule). Providers exported by an explicitly imported
 *      module take precedence over this global module, so the consumer gets the real one.
 *   Consumers always inject by token: `@Inject(INVOICE_CREATOR) private readonly invoices: InvoiceCreator`.
 */
const providers = [
  { provide: INVOICE_CREATOR, useClass: NoopInvoiceCreator },
  { provide: OUTSTANDING_CHECKER, useClass: NoopOutstandingChecker },
  { provide: SCHEDULE_CONFLICT_CHECKER, useClass: NoopScheduleConflictChecker },
];

@Global()
@Module({ providers, exports: [INVOICE_CREATOR, OUTSTANDING_CHECKER, SCHEDULE_CONFLICT_CHECKER] })
export class ContractsModule {}
