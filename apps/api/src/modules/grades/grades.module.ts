import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { GradesController } from './grades.controller';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { GradesService } from './grades.service';

@Module({
  controllers: [AssessmentsController, GradesController, ResultsController],
  providers: [GradesService, ResultsService],
  exports: [GradesService],
})
export class GradesModule {}
