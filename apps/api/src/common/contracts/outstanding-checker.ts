import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';

/**
 * Whether a student has an overdue unpaid balance (e.g. result viewing gated by fees).
 * Consumers: L-GRADES, L-ENROLL, L-STUDENT-PORTAL. Real implementation: L-FEES.
 */
export const OUTSTANDING_CHECKER = Symbol('OUTSTANDING_CHECKER');

export interface OutstandingChecker {
  hasOverdueBalance(studentId: Types.ObjectId, s?: ClientSession): Promise<boolean>;
}

@Injectable()
export class NoopOutstandingChecker implements OutstandingChecker {
  async hasOverdueBalance(): Promise<boolean> {
    return false;
  }
}
