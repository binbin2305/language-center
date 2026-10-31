import { Module } from '@nestjs/common';
import { AdmissionsReportService } from './admissions-report.service';
import { DashboardService } from './dashboard.service';
import { FinanceReportService } from './finance-report.service';
import { ReportsController } from './reports.controller';

@Module({ controllers: [ReportsController], providers: [DashboardService, AdmissionsReportService, FinanceReportService] })
export class ReportsModule {}
