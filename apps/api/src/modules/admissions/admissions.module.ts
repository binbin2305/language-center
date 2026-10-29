import { Module } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';
import { DuplicatesService } from './duplicates.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  controllers: [LeadsController],
  providers: [AdmissionsService, LeadsService, DuplicatesService],
  exports: [AdmissionsService, DuplicatesService],
})
export class AdmissionsModule {}
