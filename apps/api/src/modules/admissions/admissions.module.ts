import { Module } from '@nestjs/common';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { UsersModule } from '../users/users.module';
import { AdmissionsService } from './admissions.service';
import { ConvertService } from './convert.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DuplicatesService } from './duplicates.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [UsersModule, EnrollmentsModule],
  controllers: [LeadsController, StudentsController, DocumentsController],
  providers: [AdmissionsService, LeadsService, StudentsService, DocumentsService, DuplicatesService, ConvertService],
  exports: [AdmissionsService, DuplicatesService],
})
export class AdmissionsModule {}
