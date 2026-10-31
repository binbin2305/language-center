import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module';
import { EnrollmentsController } from './enrollments.controller';
import { AssignmentService } from './assignment.service';
import { ClassFinishedListener } from './class-finished.listener';
import { EnrollmentsService } from './enrollments.service';

// FeesModule provides the real INVOICE_CREATOR (replaces the global no-op from common/contracts).
@Module({
  imports: [FeesModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, AssignmentService, ClassFinishedListener],
  exports: [EnrollmentsService, AssignmentService],
})
export class EnrollmentsModule {}
