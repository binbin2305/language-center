import 'reflect-metadata';
import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import {
  ContractsModule,
  INVOICE_CREATOR,
  InvoiceCreator,
  OUTSTANDING_CHECKER,
  OutstandingChecker,
  SCHEDULE_CONFLICT_CHECKER,
  ScheduleConflictChecker,
} from './index';

@Injectable()
class Consumer {
  constructor(
    @Inject(INVOICE_CREATOR) readonly invoices: InvoiceCreator,
    @Inject(OUTSTANDING_CHECKER) readonly outstanding: OutstandingChecker,
    @Inject(SCHEDULE_CONFLICT_CHECKER) readonly conflicts: ScheduleConflictChecker,
  ) {}
}

class RealOutstandingChecker implements OutstandingChecker {
  async hasOverdueBalance(): Promise<boolean> {
    return true;
  }
}

/** Stands in for a lane module (e.g. FeesModule) that provides the real implementation. */
@Module({
  providers: [{ provide: OUTSTANDING_CHECKER, useClass: RealOutstandingChecker }],
  exports: [OUTSTANDING_CHECKER],
})
class LaneModule {}

describe('ContractsModule', () => {
  const id = new Types.ObjectId();

  it('cung cấp no-op toàn cục cho cả ba hợp đồng', async () => {
    @Module({ providers: [Consumer] })
    class ConsumerModule {}
    const ref = await Test.createTestingModule({ imports: [ContractsModule, ConsumerModule] }).compile();
    const c = ref.get(Consumer);
    await expect(c.invoices.createForEnrollment(id, undefined as never)).resolves.toBeNull();
    await expect(c.invoices.voidForEnrollment(id, 'x', undefined as never)).resolves.toBeUndefined();
    await expect(c.outstanding.hasOverdueBalance(id)).resolves.toBe(false);
    await expect(
      c.conflicts.findConflicts({ roomId: id, teacherId: id, startAt: new Date(0), endAt: new Date(1) }),
    ).resolves.toEqual([]);
  });

  it('module của lane import vào consumer sẽ thay thế no-op', async () => {
    @Module({ imports: [LaneModule], providers: [Consumer] })
    class ConsumerModule {}
    for (const imports of [
      [ContractsModule, ConsumerModule],
      [ConsumerModule, ContractsModule],
    ]) {
      const ref = await Test.createTestingModule({ imports }).compile();
      await expect(ref.get(Consumer).outstanding.hasOverdueBalance(id)).resolves.toBe(true);
      await expect(ref.get(Consumer).invoices.createForEnrollment(id, undefined as never)).resolves.toBeNull();
    }
  });
});
