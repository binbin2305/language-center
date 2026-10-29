import { Module } from '@nestjs/common';
import { SCHEDULE_CONFLICT_CHECKER } from '../../common/contracts/schedule-conflict-checker';
import { MongoScheduleConflictChecker } from './conflict-checker';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

@Module({
  controllers: [ScheduleController],
  providers: [ScheduleService, { provide: SCHEDULE_CONFLICT_CHECKER, useClass: MongoScheduleConflictChecker }],
  exports: [ScheduleService, SCHEDULE_CONFLICT_CHECKER],
})
export class ScheduleModule {}
