import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { ConfirmClassBanner } from '../components/confirm-class-banner';
import { useMyEnrollments } from '../hooks';

export default function MyClassesPage() {
  const q = useMyEnrollments();
  return (
    <div className="space-y-4">
      <PageHeader title="Lớp của tôi" />
      <ConfirmClassBanner />
      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : q.isError ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState title="Chưa có lớp học" description="Bạn chưa đăng ký khóa học nào." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(q.data ?? []).map((e) => (
            <li key={e.id} className="space-y-1 rounded-md border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{e.courseName}</p>
                <StatusBadge group="enrollment" value={e.status} />
              </div>
              {e.className ? <p className="text-sm">{e.className}</p> : null}
              {e.enrolledAt ? (
                <p className="text-sm text-muted-foreground">Vào lớp từ {formatDate(e.enrolledAt)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
