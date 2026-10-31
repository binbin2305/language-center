import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { AssignmentService } from './assignment.service';
import { EnrollmentsService } from './enrollments.service';

// INVOICE_CREATOR comes from common/contracts (global no-op until FeesModule is imported here at merge).
@Module({ controllers: [EnrollmentsController], providers: [EnrollmentsService, AssignmentService], exports: [EnrollmentsService, AssignmentService] })
export class EnrollmentsModule {}
