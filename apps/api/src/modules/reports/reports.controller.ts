import { Controller, Get, Query } from '@nestjs/common';
import { AcademicReportQuery, AdmissionsReportQuery, AttendanceReportQuery, FinanceReportQuery, Role } from '@lc/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AcademicReportService } from './academic-report.service';
import { AdmissionsReportService } from './admissions-report.service';
import { AttendanceReportService } from './attendance-report.service';
import { DashboardService } from './dashboard.service';
import { FinanceReportService } from './finance-report.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly admissions: AdmissionsReportService,
    private readonly finance: FinanceReportService,
    private readonly attendance: AttendanceReportService,
    private readonly academic: AcademicReportService,
  ) {}

  @Get('dashboard')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async getDashboard() {
    return { data: await this.dashboard.get() };
  }

  @Get('admissions')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async getAdmissions(@Query(new ZodValidationPipe(AdmissionsReportQuery)) query: AdmissionsReportQuery) {
    return { data: await this.admissions.get(query) };
  }

  @Get('finance')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async getFinance(@Query(new ZodValidationPipe(FinanceReportQuery)) query: FinanceReportQuery) {
    return { data: await this.finance.get(query) };
  }

  @Get('attendance')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async getAttendance(@Query(new ZodValidationPipe(AttendanceReportQuery)) query: AttendanceReportQuery) {
    return { data: await this.attendance.get(query) };
  }

  @Get('academic')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async getAcademic(@Query(new ZodValidationPipe(AcademicReportQuery)) query: AcademicReportQuery) {
    return { data: await this.academic.get(query) };
  }
}
