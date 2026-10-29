import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus } from 'lucide-react';
import { can, type CourseDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { MoneyText } from '@/components/common/money-text';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { ActiveBadge } from '@/features/settings/components/active-badge';
import { NativeSelect } from '@/features/settings/components/native-select';
import { CourseFormDialog } from '../components/course-form-dialog';
import { useCourses } from '../hooks';

const LIMIT = 20;

export default function CoursesPage() {
  const { user } = useAuth();
  const canManage = can(user, 'courses.manage');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; course: CourseDto | null }>({ open: false, course: null });
  const list = useCourses({
    page, limit: LIMIT, q: q || undefined, status: (status || undefined) as CourseDto['status'] | undefined,
  });

  const columns = useMemo<ColumnDef<CourseDto>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã' },
      { accessorKey: 'name', header: 'Tên khóa học' },
      { accessorKey: 'language', header: 'Ngôn ngữ', meta: { hideOnMobile: true } },
      { id: 'levels', header: 'Trình độ', meta: { hideOnMobile: true }, cell: ({ row }) => row.original.levels.join(', ') },
      { accessorKey: 'totalSessions', header: 'Số buổi', meta: { hideOnMobile: true } },
      { id: 'baseFee', header: 'Học phí', cell: ({ row }) => <MoneyText value={row.original.baseFee} /> },
      { id: 'status', header: 'Trạng thái', cell: ({ row }) => <ActiveBadge value={row.original.status} /> },
      ...(canManage
        ? [{
            id: 'actions',
            header: () => <span className="sr-only">Thao tác</span>,
            cell: ({ row }) => (
              <Button
                variant="ghost" size="icon" aria-label={`Sửa khóa học ${row.original.code}`}
                onClick={() => setDialog({ open: true, course: row.original })}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ),
          } satisfies ColumnDef<CourseDto>]
        : []),
    ],
    [canManage],
  );

  return (
    <div>
      <PageHeader
        title="Khóa học"
        description="Danh mục khóa học, số buổi và học phí gốc."
        actions={canManage ? (
          <Button onClick={() => setDialog({ open: true, course: null })}>
            <Plus className="mr-2 h-4 w-4" />
            Thêm khóa học
          </Button>
        ) : undefined}
      />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Tìm theo mã hoặc tên" aria-label="Tìm khóa học" className="w-64" />
        <NativeSelect aria-label="Lọc theo trạng thái" className="w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Mọi trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="ARCHIVED">Đã lưu trữ</option>
        </NativeSelect>
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
        getRowId={(c) => c.id}
        empty={{ title: 'Chưa có khóa học nào', description: canManage ? 'Bấm "Thêm khóa học" để tạo khóa học đầu tiên.' : undefined }}
      />
      <CourseFormDialog
        open={dialog.open}
        course={dialog.course}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  );
}
