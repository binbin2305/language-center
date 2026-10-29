import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { can, type RoomDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { StatusBadge } from '@/components/common/status-badge';
import { statusLabel } from '@/lib/status';
import { OptionSelect } from '@/features/settings/catalog-shared';
import { RoomFormDialog } from '../components/room-form-dialog';
import { useRooms } from '../hooks';

const LIMIT = 20;
const STATUS_OPTIONS = (['ACTIVE', 'INACTIVE'] as const).map((s) => ({ value: s, label: statusLabel('room', s) }));

export default function RoomsPage() {
  const { user } = useAuth();
  const canManage = can(user, 'rooms.manage');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; room: RoomDto | null }>({ open: false, room: null });
  const list = useRooms({
    page, limit: LIMIT, q: q || undefined, status: (status || undefined) as RoomDto['status'] | undefined,
  });

  const columns = useMemo<ColumnDef<RoomDto>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã' },
      { accessorKey: 'name', header: 'Tên phòng' },
      { accessorKey: 'capacity', header: 'Sức chứa' },
      { id: 'status', header: 'Trạng thái', cell: ({ row }) => <StatusBadge group="room" value={row.original.status} /> },
      ...(canManage
        ? [{
            id: 'actions',
            header: () => <span className="sr-only">Thao tác</span>,
            cell: ({ row }) => (
              <Button
                variant="ghost" size="icon" aria-label={`Sửa phòng ${row.original.code}`}
                onClick={() => setDialog({ open: true, room: row.original })}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ),
          } satisfies ColumnDef<RoomDto>]
        : []),
    ],
    [canManage],
  );

  return (
    <div>
      <PageHeader
        title="Phòng học"
        description="Danh mục phòng học và sức chứa."
        actions={canManage ? (
          <Button onClick={() => setDialog({ open: true, room: null })}>
            <Plus className="mr-2 h-4 w-4" />
            Thêm phòng học
          </Button>
        ) : undefined}
      />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Tìm theo mã hoặc tên" aria-label="Tìm phòng học" className="w-64" />
        <OptionSelect aria-label="Lọc theo trạng thái" className="w-48" allLabel="Mọi trạng thái" options={STATUS_OPTIONS} value={status} onValueChange={(v) => { setStatus(v); setPage(1); }} />
      </FilterBar>
      <DataTable
        columns={columns}
        data={list.data?.data ?? []}
        total={list.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={list.isPending}
        isError={list.isError}
        onRetry={() => list.refetch()}
        getRowId={(r) => r.id}
        empty={{ title: 'Chưa có phòng học nào', description: canManage ? 'Bấm "Thêm phòng học" để tạo phòng đầu tiên.' : undefined }}
      />
      <RoomFormDialog open={dialog.open} room={dialog.room} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </div>
  );
}
