import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
// ScheduleModule must be imported explicitly: it provides the real SCHEDULE_CONFLICT_CHECKER (the global one is a no-op).
import { ScheduleModule } from '../schedule/schedule.module';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';

@Module({
  imports: [ScheduleModule, EnrollmentsModule],
  controllers: [PlacementController],
  providers: [PlacementService],
  exports: [PlacementService],
})
export class PlacementModule {}
