import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { AdmissionsTrendChart } from '../components/admissions-trend-chart';
import { StatLinkCard } from '../components/stat-link-card';
import { TodaySessionsTable } from '../components/today-sessions-table';
import { useDashboard } from '../hooks';

export default function StaffDashboard() {
  const { data, isError, refetch } = useDashboard();
  return (
    <div className="space-y-6">
      <PageHeader title="Tổng quan" />
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatLinkCard label="HV đang học" value={data.activeStudents} to="/students" />
            <StatLinkCard label="Lớp đang mở" value={data.ongoingClasses} to="/classes" />
            <StatLinkCard label="Buổi học hôm nay" value={data.sessionsToday} />
            <StatLinkCard
              label="Công nợ quá hạn"
              value={data.overdueInvoices}
              to="/fees?overdue=true"
            />
            <StatLinkCard
              label="HV chờ xếp lớp"
              value={data.waitingEnrollments}
              to="/enrollments/waiting"
            />
          </div>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Buổi học hôm nay</h2>
            <TodaySessionsTable sessions={data.todaySessions} />
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Tuyển sinh 6 tháng gần nhất</h2>
            <AdmissionsTrendChart trend={data.admissionsTrend} />
          </section>
        </>
      )}
    </div>
  );
}
