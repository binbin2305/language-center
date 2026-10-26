import { Injectable } from '@nestjs/common';
import type { ClientSession, Types } from 'mongoose';
import type { SessionConflictDto } from '@lc/shared';

export interface ScheduleConflictQuery {
  roomId: Types.ObjectId;
  teacherId: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  excludeSessionId?: Types.ObjectId;
  excludePlacementTestId?: Types.ObjectId;
}

/**
 * Room/teacher overlap check across class sessions and placement tests.
 * Consumers: L-ENROLL (placement tests), L-CLASSES. Real implementation: L-SCHEDULE.
 */
export const SCHEDULE_CONFLICT_CHECKER = Symbol('SCHEDULE_CONFLICT_CHECKER');

export interface ScheduleConflictChecker {
  findConflicts(input: ScheduleConflictQuery, s?: ClientSession): Promise<SessionConflictDto[]>;
}

@Injectable()
export class NoopScheduleConflictChecker implements ScheduleConflictChecker {
  async findConflicts(): Promise<SessionConflictDto[]> {
    return [];
  }
}
