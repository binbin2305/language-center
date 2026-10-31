import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { ALL_PLACEMENT_STATUSES, can, type PlacementStatus, type PlacementTestDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { OptionSelect } from '@/components/common/option-select';
import { PageHeader } from '@/components/common/page-header';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { formatDate, formatTime } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/status';
import { usePlacementTests } from '@/features/placement/hooks';

const PlacementFormDialog = lazy(() =>
  import('@/features/placement/components/placement-form-dialog').then((m) => ({ default: m.PlacementFormDialog })),
);

const LIMIT = 20;

const columns: ColumnDef<PlacementTestDto>[] = [
  {
    id: 'time',
    header: 'Thời gian',
    cell: ({ row: { original: t } }) => (
      <Link to={`/admissions/placement/${t.id}`} className="font-medium hover:underline">
        {`${formatDate(t.startAt)} ${formatTime(t.startAt)} - ${formatTime(t.endAt)}`}
      </Link>
    ),
  },
  { id: 'course', header: 'Khóa học', cell: ({ row }) => row.original.courseName ?? '' },
  { id: 'room', header: 'Phòng', cell: ({ row }) => row.original.roomCode ?? '', meta: { hideOnMobile: true } },
  { id: 'teacher', header: 'Giáo viên chấm', cell: ({ row }) => row.original.teacherName ?? '', meta: { hideOnMobile: true } },
  { id: 'candidates', header: 'Thí sinh', cell: ({ row }) => row.original.candidates.length },
  { id: 'status', header: 'Trạng thái', cell: ({ row }) => <StatusBadge group="placement" value={row.original.status} /> },
];

const STATUS_OPTIONS = ALL_PLACEMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS.placement[s]?.label ?? s }));

export default function PlacementPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PlacementStatus | ''>('');
  const [creating, setCreating] = useState(false);
  const list = usePlacementTests({ page, limit: LIMIT, status: status || undefined });

  return (
    <div>
      <PageHeader
        title="Kiểm tra đầu vào"
        actions={
          can(user, 'placement.schedule') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Tạo đợt
            </Button>
          ) : null
        }
      />
      <FilterBar>
        <OptionSelect
          className="w-48"
          aria-label="Lọc theo trạng thái"
          allLabel="Tất cả trạng thái"
          options={STATUS_OPTIONS}
          value={status}
          onValueChange={(v) => {
            setStatus(v as PlacementStatus | '');
            setPage(1);
          }}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        data={list.data?.data ?? []}
        total={list.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        getRowId={(t) => t.id}
        empty={{ title: 'Chưa có đợt kiểm tra', description: 'Các đợt kiểm tra đầu vào sẽ hiển thị ở đây.' }}
      />
      {creating ? (
        <Suspense fallback={null}>
          <PlacementFormDialog open onOpenChange={setCreating} />
        </Suspense>
      ) : null}
    </div>
  );
}
