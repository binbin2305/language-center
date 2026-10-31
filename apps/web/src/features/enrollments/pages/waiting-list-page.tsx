import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { can, type WaitingEnrollmentDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { formatDate } from '@/lib/format';
import { AssignPanel } from '../components/assign-panel';
import { useWaitingEnrollments } from '../hooks';

const LIMIT = 20;
/** DESIGN §4.5: waiting 15 days or more is highlighted. */
export const OVERDUE_DAYS = 15;

export default function WaitingListPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WaitingEnrollmentDto | null>(null);
  const q = useWaitingEnrollments(page, LIMIT);
  const assignable = can(user, 'enrollments.assign');

  const columns: ColumnDef<WaitingEnrollmentDto>[] = [
    { id: 'studentCode', header: 'Mã HV', cell: ({ row }) => row.original.studentCode },
    { id: 'studentName', header: 'Học viên', cell: ({ row }) => <span className="font-medium">{row.original.studentName}</span> },
    { id: 'courseName', header: 'Khóa học', cell: ({ row }) => row.original.courseName },
    { id: 'placementLevel', header: 'Trình độ', cell: ({ row }) => row.original.placementLevel ?? '-' },
    {
      id: 'waitingSince',
      header: 'Chờ từ',
      meta: { hideOnMobile: true },
      cell: ({ row }) => (row.original.waitingSince ? formatDate(row.original.waitingSince) : '-'),
    },
    {
      id: 'waitingDays',
      header: 'Đã chờ',
      cell: ({ row }) => {
        const overdue = row.original.waitingDays >= OVERDUE_DAYS;
        return (
          <span
            data-overdue={overdue ? 'true' : 'false'}
            className={overdue ? 'font-semibold text-warning' : undefined}
          >
            {row.original.waitingDays} ngày
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        assignable ? (
          <Button
            size="sm"
            aria-label={`Xếp lớp cho ${row.original.studentName}`}
            onClick={() => setSelected(row.original)}
          >
            Xếp lớp
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader title="Xếp lớp" description="Học viên đã có kết quả kiểm tra, đang chờ được xếp vào lớp." />
      <DataTable
        columns={columns}
        data={q.data?.data ?? []}
        total={q.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => void q.refetch()}
        getRowId={(r) => r.id}
        empty={{ title: 'Không có học viên chờ xếp lớp' }}
      />
      {selected ? (
        <AssignPanel enrollment={selected} open onOpenChange={(o) => !o && setSelected(null)} />
      ) : null}
    </div>
  );
}
