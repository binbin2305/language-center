import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model, Types } from 'mongoose';
import { ClockService } from '../../common/clock/clock.service';
import type { OutstandingChecker } from '../../common/contracts/outstanding-checker';
import { Models } from '../../database/models';
import type { Invoice } from '../../database/schemas/invoice.schema';
import { overdueFilter } from './fees.mapper';

/** Real OUTSTANDING_CHECKER (FR-GRD-07): any overdue invoice with a balance, same definition as isOverdue. */
@Injectable()
export class OutstandingCheckerService implements OutstandingChecker {
  constructor(
    @InjectModel(Models.Invoice) private readonly invoices: Model<Invoice>,
    private readonly clock: ClockService,
  ) {}

  async hasOverdueBalance(studentId: Types.ObjectId, s?: ClientSession): Promise<boolean> {
    const hit = await this.invoices.exists({ studentId, ...overdueFilter(this.clock.now()) }).session(s ?? null);
    return hit !== null;
  }
}
