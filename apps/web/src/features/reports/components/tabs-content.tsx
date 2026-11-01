import type { AcademicReportDto, AdmissionsReportDto, AttendanceReportDto, FinanceReportDto } from '@lc/shared';
import { ALL_GRADE_CLASSES } from '@lc/shared';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { MoneyText } from '@/components/common/money-text';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReportChart } from './report-chart';
import { StatCard } from './stat-card';

export const EMPTY_TEXT = 'Không có dữ liệu thống kê cho khoảng thời gian này';
const pct = (r: number | null) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`);
const BLUE = '#2563eb';
const AMBER = '#d97706';

interface QueryLike<T> {
  data?: T;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
}

function Wrap<T>({ q, isEmpty, children }: { q: QueryLike<T>; isEmpty: (d: T) => boolean; children: (d: T) => React.ReactNode }) {
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  if (isEmpty(q.data)) return <EmptyState title={EMPTY_TEXT} />;
  return <div className="space-y-4">{children(q.data)}</div>;
}

function Grid({ heads, rows }: { heads: string[]; rows: (string | number | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>{heads.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>{r.map((c, j) => <TableCell key={j}>{c}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function AdmissionsContent({ q }: { q: QueryLike<AdmissionsReportDto> }) {
  return (
    <Wrap q={q} isEmpty={(d) => d.rows.length === 0 && d.totals.leads === 0 && d.totals.waiting === 0}>
      {(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Liên hệ mới">{d.totals.leads}</StatCard>
            <StatCard label="Hồ sơ mới">{d.totals.newProfiles}</StatCard>
            <StatCard label="Tỷ lệ chuyển đổi">{pct(d.totals.conversionRate)}</StatCard>
            <StatCard label="Đã ghi danh">{d.totals.enrolled}</StatCard>
            <StatCard label="Chờ xếp lớp">{d.totals.waiting}</StatCard>
          </div>
          <ReportChart
            label="Biểu đồ tuyển sinh theo khóa học"
            data={d.rows.map((r) => ({ name: r.courseName, leads: r.leads, newProfiles: r.newProfiles, enrolled: r.enrolled }))}
            series={[
              { key: 'leads', name: 'Liên hệ', color: BLUE },
              { key: 'newProfiles', name: 'Hồ sơ', color: AMBER },
              { key: 'enrolled', name: 'Ghi danh', color: '#059669' },
            ]}
          />
          <Grid
            heads={['Khóa học', 'Liên hệ', 'Hồ sơ mới', 'Chuyển đổi', 'Ghi danh', 'Chờ xếp lớp']}
            rows={d.rows.map((r) => [r.courseName, r.leads, r.newProfiles, pct(r.conversionRate), r.enrolled, r.waiting])}
          />
        </>
      )}
    </Wrap>
  );
}

export function AttendanceContent({ q }: { q: QueryLike<AttendanceReportDto> }) {
  return (
    <Wrap q={q} isEmpty={(d) => d.byClass.length === 0}>
      {(d) => (
        <>
          <ReportChart
            label="Biểu đồ tỷ lệ chuyên cần theo lớp"
            data={d.byClass.map((r) => ({ name: r.classCode, rate: Math.round(r.attendanceRate * 1000) / 10 }))}
            series={[{ key: 'rate', name: 'Chuyên cần (%)', color: BLUE }]}
          />
          <Grid
            heads={['Lớp', 'Buổi học', 'Lượt điểm danh', 'Tỷ lệ chuyên cần']}
            rows={d.byClass.map((r) => [r.classCode, r.sessions, r.records, pct(r.attendanceRate)])}
          />
          {d.byStudent.length > 0 ? (
            <section aria-label="Theo học viên">
              <h2 className="mb-2 text-base font-semibold">Theo học viên</h2>
              <Grid
                heads={['Mã HV', 'Họ tên', 'Lớp', 'Số buổi', 'Vắng', 'Tỷ lệ chuyên cần']}
                rows={d.byStudent.map((r) => [
                  r.studentCode,
                  r.fullName,
                  d.byClass.find((c) => c.classId === r.classId)?.classCode ?? '—',
                  r.records,
                  r.absences,
                  pct(r.attendanceRate),
                ])}
              />
            </section>
          ) : null}
          {d.overThreshold.length > 0 ? (
            <section aria-label="Học viên vượt ngưỡng vắng">
              <h2 className="mb-2 text-base font-semibold">Học viên vượt ngưỡng vắng</h2>
              <Grid
                heads={['Mã HV', 'Họ tên', 'Lớp', 'Tỷ lệ vắng']}
                rows={d.overThreshold.map((r) => [r.studentCode, r.fullName, r.classCode, pct(r.absenceRate)])}
              />
            </section>
          ) : null}
        </>
      )}
    </Wrap>
  );
}

const GRADE_LABEL: Record<string, string> = {
  EXCELLENT: 'Xuất sắc', GOOD: 'Giỏi', FAIR: 'Khá', AVERAGE: 'Trung bình', FAIL: 'Yếu',
};

/** Nothing graded in range: the API still lists every matching class, each with 0 students. */
const isAcademicEmpty = (d: AcademicReportDto) => d.rows.every((r) => r.students === 0);

export function AcademicContent({ q }: { q: QueryLike<AcademicReportDto> }) {
  return (
    <Wrap q={q} isEmpty={isAcademicEmpty}>
      {(d) => (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Tỷ lệ đạt">{pct(d.passRate)}</StatCard>
            <StatCard label="Tỷ lệ không đạt">{pct(d.failRate)}</StatCard>
          </div>
          <ReportChart
            label="Biểu đồ phân loại học lực"
            data={ALL_GRADE_CLASSES.map((g) => ({ name: GRADE_LABEL[g] ?? g, students: d.distribution[g] ?? 0 }))}
            series={[{ key: 'students', name: 'Số học viên', color: BLUE }]}
          />
          <Grid
            heads={['Lớp', 'Giáo viên', 'Số HV', 'Điểm TB', 'Tỷ lệ đạt']}
            rows={d.rows.map((r) => [
              r.classCode, r.teacherName ?? '—', r.students,
              r.averageScore === null ? '—' : r.averageScore.toFixed(2), pct(r.passRate),
            ])}
          />
        </>
      )}
    </Wrap>
  );
}

export function FinanceContent({ q }: { q: QueryLike<FinanceReportDto> }) {
  return (
    <Wrap q={q} isEmpty={(d) => d.rows.length === 0}>
      {(d) => (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Doanh thu"><MoneyText value={d.totals.revenue} /></StatCard>
            <StatCard label="Tổng phải thu"><MoneyText value={d.totals.totalDue} /></StatCard>
            <StatCard label="Còn nợ"><MoneyText value={d.totals.outstanding} /></StatCard>
            <StatCard label="Quá hạn"><MoneyText value={d.totals.overdue} /></StatCard>
            <StatCard label="Giảm giá"><MoneyText value={d.totals.totalDiscount} /></StatCard>
          </div>
          <ReportChart
            label="Biểu đồ doanh thu và công nợ"
            data={d.rows.map((r) => ({ name: r.label, revenue: r.revenue, outstanding: r.outstanding }))}
            series={[
              { key: 'revenue', name: 'Doanh thu', color: BLUE },
              { key: 'outstanding', name: 'Còn nợ', color: AMBER },
            ]}
            format={(n) => `${Math.round(n / 1000).toLocaleString('vi-VN')}k`}
          />
          <Grid
            heads={['Nhóm', 'Doanh thu', 'Tổng phải thu', 'Còn nợ', 'Quá hạn', 'Giảm giá']}
            rows={d.rows.map((r) => [
              r.label,
              <MoneyText key="a" value={r.revenue} />, <MoneyText key="b" value={r.totalDue} />,
              <MoneyText key="c" value={r.outstanding} />, <MoneyText key="d" value={r.overdue} />,
              <MoneyText key="e" value={r.totalDiscount} />,
            ])}
          />
        </>
      )}
    </Wrap>
  );
}
