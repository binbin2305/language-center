import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

// INVOICE_CREATOR comes from common/contracts (global no-op until FeesModule is imported here at merge).
@Module({ providers: [EnrollmentsService], exports: [EnrollmentsService] })
export class EnrollmentsModule {}
