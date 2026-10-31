import { Module } from '@nestjs/common';
import { AcademicReportService } from './academic-report.service';
import { AdmissionsReportService } from './admissions-report.service';
import { AttendanceReportService } from './attendance-report.service';
import { DashboardService } from './dashboard.service';
import { FinanceReportService } from './finance-report.service';
import { ReportsController } from './reports.controller';

@Module({ controllers: [ReportsController], providers: [DashboardService, AdmissionsReportService, FinanceReportService, AttendanceReportService, AcademicReportService] })
export class ReportsModule {}
