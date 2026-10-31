import { Link } from 'react-router-dom';
import { vnDay } from '@lc/shared';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { usePendingAssessments } from '@/features/grades/hooks';
import { formatDate, formatTime } from '@/lib/format';
import { HomeBlock } from '../components/home-block';
import { useSessionsBetween, useUpcomingPlacementTests } from '../hooks';

const Empty = ({ text }: { text: string }) => <p className="text-sm text-muted-foreground">{text}</p>;

export default function TeacherHome() {
  const now = new Date();
  const today = vnDay(now);
  const sessions = useSessionsBetween(today, today);
  const pending = usePendingAssessments();
  const placement = useUpcomingPlacementTests(now.toISOString());
  const todays = (sessions.data ?? [])
    .filter((s) => s.status === 'SCHEDULED')
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const tests = placement.data?.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Hôm nay của tôi" description={formatDate(now)} />
      <HomeBlock title="Buổi dạy hôm nay" query={sessions}>
        {todays.length === 0 ? <Empty text="Hôm nay không có buổi dạy" /> : null}
        <div className="space-y-3">
          {todays.map((s) => (
            <article key={s.id} aria-label={`Buổi ${s.classCode ?? s.classId}`} className="space-y-2 rounded-md border p-3">
              <p className="text-lg font-semibold">{s.classCode ?? 'Lớp'}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(s.startAt)} - {formatTime(s.endAt)}
                {s.roomName ? ` · ${s.roomName}` : ''}
              </p>
              {s.attendanceTakenAt ? (
                <p className="text-sm font-medium text-success">Đã điểm danh</p>
              ) : (
                <Button asChild className="h-11 w-full">
                  <Link to={`/sessions/${s.id}/attendance`}>Điểm danh</Link>
                </Button>
              )}
            </article>
          ))}
        </div>
      </HomeBlock>
      <HomeBlock title="Bài cần nhập điểm" query={pending}>
        {(pending.data ?? []).length === 0 ? <Empty text="Không có bài cần nhập điểm" /> : null}
        <ul className="space-y-2">
          {(pending.data ?? []).map((a) => (
            <li key={a.id}>
              <Link to={`/assessments/${a.id}/grades`} className="flex min-h-11 flex-col justify-center rounded-md border p-3 hover:bg-accent">
                <span className="font-medium">{a.name}</span>
                <span className="text-sm text-muted-foreground">{a.className} · {formatDate(a.heldOn)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </HomeBlock>
      <HomeBlock title="Kiểm tra đầu vào sắp tới" query={placement}>
        {tests.length === 0 ? <Empty text="Không có đợt kiểm tra sắp tới" /> : null}
        <ul className="space-y-2">
          {tests.map((t) => (
            <li key={t.id} className="rounded-md border p-3">
              <p className="font-medium">{t.courseName ?? 'Kiểm tra đầu vào'}</p>
              <p className="text-sm text-muted-foreground">
                {formatTime(t.startAt)} {formatDate(t.startAt)}
                {t.roomCode ? ` · ${t.roomCode}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </HomeBlock>
    </div>
  );
}
