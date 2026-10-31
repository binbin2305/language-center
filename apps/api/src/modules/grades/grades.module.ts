import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';

@Module({
  controllers: [AssessmentsController, GradesController],
  providers: [GradesService],
  exports: [GradesService],
})
export class GradesModule {}
