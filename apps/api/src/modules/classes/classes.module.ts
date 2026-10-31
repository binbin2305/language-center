import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

// AttendanceModule exports AttendanceStatsService (roster absence warnings, D17). It must not import ClassesModule.
@Module({
  imports: [AttendanceModule],
  controllers: [ClassesController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
