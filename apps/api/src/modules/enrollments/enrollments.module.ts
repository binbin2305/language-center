import { Module } from '@nestjs/common';
import { FeesModule } from '../fees/fees.module';
import { EnrollmentsService } from './enrollments.service';

@Module({ imports: [FeesModule], providers: [EnrollmentsService], exports: [EnrollmentsService] })
export class EnrollmentsModule {}
