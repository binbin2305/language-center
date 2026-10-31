import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceStatsService } from './attendance-stats.service';
import { AttendanceService } from './attendance.service';
import { SessionAttendanceController } from './session-attendance.controller';

@Module({
  controllers: [AttendanceController, SessionAttendanceController],
  providers: [AttendanceService, AttendanceStatsService],
  exports: [AttendanceService, AttendanceStatsService],
})
export class AttendanceModule {}
