import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatVnd, type ExportReportQuery, type ReportTypeParam } from '@lc/shared';
import { PdfService } from '../../common/pdf/pdf.service';
import { AcademicReportService } from './academic-report.service';
import { AdmissionsReportService } from './admissions-report.service';
import { AttendanceReportService } from './attendance-report.service';
import { FinanceReportService } from './finance-report.service';

type Cell = string | number;
interface Table {
  title: string;
  headers: string[];
  rows: Cell[][];
  /** Column indexes holding VND amounts: formatted in the PDF, kept numeric in xlsx. */
  money?: number[];
}

const EMPTY = 'Không có dữ liệu';
const pct = (n: number | null) => (n === null ? '' : `${Math.round(n * 10000) / 100}%`);

export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/** FR-RPT-05. Reuses the four report services; only formats their output. */
@Injectable()
export class ExportService {
  constructor(
    private readonly pdf: PdfService,
    private readonly admissions: AdmissionsReportService,
    private readonly finance: FinanceReportService,
    private readonly attendance: AttendanceReportService,
    private readonly academic: AcademicReportService,
  ) {}

  async export(type: ReportTypeParam, q: ExportReportQuery): Promise<ExportFile> {
    const table = await this.table(type, q);
    const ext = q.format;
    const buffer = ext === 'xlsx' ? await this.xlsx(table) : await this.renderPdf(table, q);
    return {
      buffer,
      contentType: ext === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
      filename: `bao-cao-${type}-${q.from}-${q.to}.${ext}`,
    };
  }

  private async table(type: ReportTypeParam, q: ExportReportQuery): Promise<Table> {
    switch (type) {
      case 'admissions': {
        const r = await this.admissions.get({ from: q.from, to: q.to, courseId: q.courseId });
        return {
          title: 'Báo cáo tuyển sinh',
          headers: ['Khóa học', 'Lead', 'Hồ sơ mới', 'Tỷ lệ chuyển đổi', 'Đã ghi danh', 'Chờ xếp lớp'],
          rows: r.rows.map((x) => [x.courseName, x.leads, x.newProfiles, pct(x.conversionRate), x.enrolled, x.waiting]),
        };
      }
      case 'attendance': {
        const r = await this.attendance.get({ from: q.from, to: q.to, classId: q.classId, courseId: q.courseId });
        return {
          title: 'Báo cáo chuyên cần',
          headers: ['Lớp', 'Số buổi', 'Số bản ghi', 'Tỷ lệ chuyên cần'],
          rows: r.byClass.map((x) => [x.classCode, x.sessions, x.records, pct(x.attendanceRate)]),
        };
      }
      case 'academic': {
        const r = await this.academic.get({ from: q.from, to: q.to, classId: q.classId, courseId: q.courseId, teacherId: q.teacherId });
        return {
          title: 'Báo cáo học tập',
          headers: ['Lớp', 'Giáo viên', 'Số học viên', 'Điểm trung bình', 'Tỷ lệ đạt'],
          // The API lists every matching class; with nothing graded in range (all 0 students) export the empty row.
          rows: r.rows.every((x) => x.students === 0)
            ? []
            : r.rows.map((x) => [x.classCode, x.teacherName ?? '', x.students, x.averageScore ?? '', pct(x.passRate)]),
        };
      }
      case 'finance': {
        const r = await this.finance.get({ from: q.from, to: q.to, courseId: q.courseId, classId: q.classId, groupBy: q.groupBy ?? 'month' });
        return {
          title: 'Báo cáo tài chính',
          headers: ['Nhóm', 'Doanh thu', 'Tổng phải thu', 'Còn nợ', 'Quá hạn', 'Giảm giá'],
          rows: r.rows.map((x) => [x.label, x.revenue, x.totalDue, x.outstanding, x.overdue, x.totalDiscount]),
          money: [1, 2, 3, 4, 5],
        };
      }
    }
  }

  private async xlsx(t: Table): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(t.title.slice(0, 31));
    ws.addRow(t.headers).font = { bold: true };
    if (t.rows.length === 0) ws.addRow([EMPTY]);
    else t.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => (c.width = 20));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private renderPdf(t: Table, q: ExportReportQuery): Promise<Buffer> {
    const body: Content = t.rows.length
      ? {
          table: {
            headerRows: 1,
            widths: t.headers.map(() => '*'),
            body: [t.headers.map((h) => ({ text: h, bold: true })), ...t.rows.map((r) => r.map((c, i) => (typeof c === 'number' && t.money?.includes(i) ? formatVnd(c) : String(c))))],
          },
        }
      : {
          table: {
            headerRows: 1,
            widths: t.headers.map(() => '*'),
            body: [t.headers.map((h) => ({ text: h, bold: true })), [{ text: EMPTY, colSpan: t.headers.length }, ...t.headers.slice(1).map(() => ({ text: '' }))]],
          },
        };
    const def: TDocumentDefinitions = {
      pageOrientation: 'landscape',
      content: [
        { text: t.title, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        { text: `Từ ${q.from} đến ${q.to}`, margin: [0, 0, 0, 10] },
        body,
      ],
    };
    return this.pdf.render(def);
  }
}
