import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { can } from '@lc/shared';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/auth/use-auth';
import { formatDate, formatTime } from '@/lib/format';
import { CandidatesDialog } from '@/features/placement/components/candidates-dialog';
import { usePlacementTest } from '@/features/placement/hooks';

export default function PlacementDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = usePlacementTest(id);
  const [adding, setAdding] = useState(false);
  const t = q.data;

  if (q.isLoading || q.isError || !t) {
    return (
      <div>
        <PageHeader title="Chi tiết đợt kiểm tra" />
        {q.isLoading ? <Skeleton className="h-40 w-full" /> : <ErrorState onRetry={() => void q.refetch()} />}
      </div>
    );
  }

  const open = t.status === 'SCHEDULED';
  return (
    <div>
      <PageHeader
        title="Chi tiết đợt kiểm tra"
        breadcrumb={[{ label: 'Kiểm tra đầu vào', to: '/admissions/placement' }, { label: t.courseName ?? 'Đợt kiểm tra' }]}
        description={`${formatDate(t.startAt)} ${formatTime(t.startAt)} - ${formatTime(t.endAt)} · Phòng ${t.roomCode ?? ''} · ${t.teacherName ?? ''}`}
        actions={
          <>
            <StatusBadge group="placement" value={t.status} />
            {open && can(user, 'placement.schedule') ? (
              <Button onClick={() => setAdding(true)}>Thêm thí sinh</Button>
            ) : null}
            {open && can(user, 'placement.grade') ? (
              <Button asChild>
                <Link to={`/admissions/placement/${t.id}/grade`}>Chấm điểm</Link>
              </Button>
            ) : null}
          </>
        }
      />
      {t.candidates.length === 0 ? (
        <EmptyState title="Chưa có thí sinh" description="Thêm học viên đang chờ kiểm tra vào đợt này." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mã HV</TableHead>
              <TableHead>Học viên</TableHead>
              <TableHead>Điểm</TableHead>
              <TableHead>Trình độ</TableHead>
              <TableHead>Nhận xét</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.candidates.map((c) => (
              <TableRow key={c.enrollmentId}>
                <TableCell>{c.studentCode}</TableCell>
                <TableCell>{c.studentName}</TableCell>
                <TableCell>{c.score ?? '-'}</TableCell>
                <TableCell>{c.level ?? '-'}</TableCell>
                <TableCell>{c.comment ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {adding ? (
        <CandidatesDialog
          open
          onOpenChange={setAdding}
          testId={t.id}
          courseId={t.courseId}
          existing={t.candidates.map((c) => c.enrollmentId)}
        />
      ) : null}
    </div>
  );
}
