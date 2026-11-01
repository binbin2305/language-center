import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AcademicReportQuery, ExportReportQuery, ReportTypeParam, AdmissionsReportQuery, AttendanceReportQuery, FinanceReportQuery, Role } from '@lc/shared';
import { Roles } from '../../common/auth/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AcademicReportService } from './academic-report.service';
import { AdmissionsReportService } from './admissions-report.service';
import { AttendanceReportService } from './attendance-report.service';
import { DashboardService } from './dashboard.service';
import { ExportService } from './export.service';
import { FinanceReportService } from './finance-report.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly admissions: AdmissionsReportService,
    private readonly finance: FinanceReportService,
    private readonly attendance: AttendanceReportService,
    private readonly academic: AcademicReportService,
    private readonly exporter: ExportService,
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

  /** Declared after the four fixed routes; `:type/export` has two segments so it cannot shadow them. */
  @Get(':type/export')
  @Roles(Role.MANAGER, Role.ACADEMIC_STAFF)
  async export(
    @Param('type', new ZodValidationPipe(ReportTypeParam)) type: ReportTypeParam,
    @Query(new ZodValidationPipe(ExportReportQuery)) query: ExportReportQuery,
    @Res() res: Response,
  ) {
    const file = await this.exporter.export(type, query);
    // Headers are set only after a successful build so error bodies stay JSON.
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.end(file.buffer);
  }
}
