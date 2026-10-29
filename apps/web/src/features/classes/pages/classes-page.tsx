import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { ALL_CLASS_STATUSES, can, type ClassDto, type ClassStatus } from '@lc/shared';
import { CapacityBar } from '@/components/common/capacity-bar';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/auth/use-auth';
import { formatDate } from '@/lib/format';
import { STATUS_LABELS } from '@/lib/status';
import { useClasses, useCourseOptions } from '../hooks';

const ClassFormDialog = lazy(() =>
  import('../components/class-form-dialog').then((m) => ({ default: m.ClassFormDialog })),
);

const LIMIT = 20;
const ALL = '__all__';

const columns: ColumnDef<ClassDto>[] = [
  { id: 'code', header: 'Mã lớp', accessorKey: 'code' },
  {
    id: 'name',
    header: 'Tên lớp',
    cell: ({ row }) => (
      <Link to={`/classes/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { id: 'course', header: 'Khóa học', cell: ({ row }) => row.original.courseName ?? '', meta: { hideOnMobile: true } },
  { id: 'level', header: 'Trình độ', accessorKey: 'level', meta: { hideOnMobile: true } },
  { id: 'teacher', header: 'Giáo viên', cell: ({ row }) => row.original.teacherName ?? '', meta: { hideOnMobile: true } },
  {
    id: 'capacity',
    header: 'Sĩ số',
    cell: ({ row }) => <CapacityBar current={row.original.currentSize} max={row.original.maxCapacity} />,
  },
  {
    id: 'time',
    header: 'Thời gian',
    cell: ({ row }) => `${formatDate(row.original.startDate)} - ${formatDate(row.original.endDate)}`,
    meta: { hideOnMobile: true },
  },
  { id: 'status', header: 'Trạng thái', cell: ({ row }) => <StatusBadge group="class" value={row.original.status} /> },
];

export default function ClassesPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('');
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState<ClassStatus | ''>('');
  const [hasSeat, setHasSeat] = useState(false);
  const [creating, setCreating] = useState(false);
  const courses = useCourseOptions();
  const list = useClasses({
    page,
    limit: LIMIT,
    q,
    level,
    courseId: courseId || undefined,
    status: status || undefined,
    hasSeat: hasSeat || undefined,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader
        title="Lớp học"
        actions={
          can(user, 'classes.manage') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Thêm lớp
            </Button>
          ) : null
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Tìm theo mã hoặc tên lớp" aria-label="Tìm lớp học" className="w-64" />
        <Select value={courseId || ALL} onValueChange={(v) => reset(setCourseId)(v === ALL ? '' : v)}>
          <SelectTrigger className="w-48" aria-label="Lọc theo khóa học">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả khóa học</SelectItem>
            {(courses.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-36"
          aria-label="Lọc theo trình độ"
          placeholder="Trình độ"
          value={level}
          onChange={(e) => reset(setLevel)(e.target.value)}
        />
        <Select value={status || ALL} onValueChange={(v) => reset(setStatus)(v === ALL ? '' : (v as ClassStatus))}>
          <SelectTrigger className="w-44" aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
            {ALL_CLASS_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS.class[s]?.label ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox id="has-seat" checked={hasSeat} onCheckedChange={(c) => reset(setHasSeat)(c === true)} />
          <Label htmlFor="has-seat">Còn chỗ</Label>
        </div>
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
        getRowId={(r) => r.id}
        empty={{
          title: 'Chưa có lớp học nào',
          description: 'Thử đổi bộ lọc hoặc tạo lớp mới.',
        }}
      />
      {creating ? (
        <Suspense fallback={null}>
          <ClassFormDialog open onOpenChange={setCreating} />
        </Suspense>
      ) : null}
    </div>
  );
}
