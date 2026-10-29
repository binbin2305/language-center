import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { UsersModule } from '../users/users.module';
import { AdmissionsService } from './admissions.service';
import { ConvertService } from './convert.service';
import { DuplicatesService } from './duplicates.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [UsersModule, EnrollmentsModule],
  controllers: [LeadsController],
  providers: [AdmissionsService, LeadsService, DuplicatesService, ConvertService],
  exports: [AdmissionsService, DuplicatesService],
})
export class AdmissionsModule {}
