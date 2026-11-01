import { Link } from 'react-router-dom';
import { addVnDays, attendanceRate } from '@lc/shared';
import { PageHeader } from '@/components/common/page-header';
import { MoneyText } from '@/components/common/money-text';
import { ConfirmClassBanner } from '@/features/enrollments';
import { ApiError } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useVnToday } from '@/lib/use-vn-today';
import { errorMessage } from '@/lib/error-messages';
import { HomeBlock } from '../components/home-block';
import { useMyAttendanceSummary, useMyInvoices, useMyResults, useSessionsBetween } from '../hooks';

const Big = ({ children }: { children: React.ReactNode }) => <p className="text-3xl font-semibold">{children}</p>;
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;

export default function StudentHome() {
  const today = useVnToday();
  const now = new Date();
  const sessions = useSessionsBetween(today, addVnDays(today, 14));
  const attendance = useMyAttendanceSummary();
  const results = useMyResults();
  const invoices = useMyInvoices();

  const next = (sessions.data ?? [])
    .filter((s) => s.status === 'SCHEDULED' && new Date(s.startAt).getTime() > now.getTime())
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];

  const counts = (attendance.data ?? []).reduce(
    (acc, r) => ({
      PRESENT: acc.PRESENT + r.PRESENT,
      LATE: acc.LATE + r.LATE,
      EXCUSED: acc.EXCUSED + r.EXCUSED,
      UNEXCUSED: acc.UNEXCUSED + r.UNEXCUSED,
    }),
    { PRESENT: 0, LATE: 0, EXCUSED: 0, UNEXCUSED: 0 },
  );
  const rate = attendanceRate(counts);

  const averages = (results.data?.data ?? []).map((r) => r.average).filter((a): a is number => a !== null);
  const gpa = averages.length ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 100) / 100 : null;

  const owing = (invoices.data?.data ?? []).filter((i) => i.status !== 'VOID' && i.balance > 0);
  const debt = owing.reduce((a, i) => a + i.balance, 0);
  const nearestDue = owing.map((i) => i.dueDate).sort()[0];

  const resultsError =
    results.error instanceof ApiError && results.error.code === 'FEES_OUTSTANDING' ? (
      <div role="alert" className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
        {errorMessage(results.error)}
      </div>
    ) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader title="Trang của tôi" />
      <ConfirmClassBanner />
      <HomeBlock title="Buổi học tiếp theo" query={sessions}>
        {next ? (
          <>
            <Big>{formatTime(next.startAt)}</Big>
            <p className="font-medium">{next.classCode ?? 'Lớp'}</p>
            <Muted>
              {formatDate(next.startAt)}
              {next.roomName ? ` · ${next.roomName}` : ''}
            </Muted>
          </>
        ) : (
          <Muted>Chưa có buổi học sắp tới</Muted>
        )}
        <Link to="/schedule" className="inline-flex min-h-11 items-center text-sm text-primary underline">Xem lịch học</Link>
      </HomeBlock>
      <HomeBlock title="Chuyên cần" query={attendance}>
        {rate === null ? <Muted>Chưa có dữ liệu điểm danh</Muted> : <Big>{`${Math.round(rate * 100)}%`}</Big>}
        <Link to="/me/attendance" className="inline-flex min-h-11 items-center text-sm text-primary underline">Xem chi tiết</Link>
      </HomeBlock>
      <HomeBlock title="Điểm trung bình" query={results} errorOverride={resultsError}>
        {gpa === null ? <Muted>Chưa có điểm</Muted> : <Big>{String(gpa)}</Big>}
        <Link to="/me/results" className="inline-flex min-h-11 items-center text-sm text-primary underline">Xem kết quả</Link>
      </HomeBlock>
      <HomeBlock title="Học phí" query={invoices}>
        {debt === 0 ? (
          <Muted>Không còn nợ</Muted>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Còn nợ</p>
            <MoneyText value={debt} className="text-3xl font-semibold" />
            {nearestDue ? <Muted>{`Hạn gần nhất: ${formatDate(nearestDue)}`}</Muted> : null}
          </>
        )}
        <Link to="/me/fees" className="inline-flex min-h-11 items-center text-sm text-primary underline">Xem học phí</Link>
      </HomeBlock>
    </div>
  );
}
