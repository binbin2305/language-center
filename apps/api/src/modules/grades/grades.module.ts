import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module';
import { AssessmentsController } from './assessments.controller';
import { GradesController } from './grades.controller';
import { ResultsController } from './results.controller';
import { ResultsService } from './results.service';
import { GradesService } from './grades.service';

// FeesModule provides the real OUTSTANDING_CHECKER (FR-GRD-07).
@Module({
  imports: [FeesModule],
  controllers: [AssessmentsController, GradesController, ResultsController],
  providers: [GradesService, ResultsService],
  exports: [GradesService],
})
export class GradesModule {}
