import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { ALL_LEAD_STATUSES, can, CourseStatus, type LeadDto, type LeadStatus } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import type { DateRangeValue } from '@/components/common/date-range-picker';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/auth/use-auth';
import { formatDate } from '@/lib/format';
import { useCourses } from '@/features/courses/hooks';
import { useLeads } from '../hooks';
import { StatusBadge } from '@/components/common/status-badge';
import { statusLabel } from '@/lib/status';

const ACTIVE_COURSES = { status: CourseStatus.ACTIVE, limit: 100 };

// Calendar + date-fns locale are heavy; load them only once the list page is on screen.
const DateRangePicker = lazy(() =>
  import('@/components/common/date-range-picker').then((m) => ({ default: m.DateRangePicker })),
);

const ALL = 'ALL';
const LIMIT = 20;

export default function LeadsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LeadStatus | undefined>();
  const [courseId, setCourseId] = useState<string | undefined>();
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const courses = useCourses(ACTIVE_COURSES);
  const leads = useLeads({
    page,
    limit: LIMIT,
    q: q || undefined,
    status,
    courseId,
    from: range.from ?? undefined,
    to: range.to ?? undefined,
  });

  const courseName = useMemo(
    () => new Map((courses.data?.data ?? []).map((c) => [c.id, c.name])),
    [courses.data],
  );
  const columns = useMemo<ColumnDef<LeadDto>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: 'Họ tên',
        cell: ({ row }) => (
          <Link className="font-medium hover:underline" to={`/admissions/leads/${row.original.id}`}>
            {row.original.fullName}
          </Link>
        ),
      },
      { accessorKey: 'phone', header: 'SĐT' },
      {
        id: 'course',
        header: 'Khóa quan tâm',
        meta: { hideOnMobile: true },
        cell: ({ row }) => courseName.get(row.original.interestedCourseId) ?? '—',
      },
      {
        id: 'createdAt',
        header: 'Ngày tiếp nhận',
        meta: { hideOnMobile: true },
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      { id: 'status', header: 'Trạng thái', cell: ({ row }) => <StatusBadge group="lead" value={row.original.status} /> },
    ],
    [courseName],
  );

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Tuyển sinh"
        description="Danh sách khách hàng tiềm năng"
        actions={
          can(user, 'leads.create') ? (
            <Button asChild>
              <Link to="/admissions/leads/new">Tiếp nhận mới</Link>
            </Button>
          ) : null
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Tìm theo tên, SĐT, email" aria-label="Tìm lead" className="w-64" />
        <Select value={status ?? ALL} onValueChange={(v) => reset(setStatus)(v === ALL ? undefined : ALL_LEAD_STATUSES.find((s) => s === v))}>
          <SelectTrigger className="w-44" aria-label="Trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {ALL_LEAD_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{statusLabel('lead', s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={courseId ?? ALL} onValueChange={(v) => reset(setCourseId)(v === ALL ? undefined : v)}>
          <SelectTrigger className="w-52" aria-label="Khóa học">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả khóa học</SelectItem>
            {(courses.data?.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-60">
          <Suspense fallback={null}>
            <DateRangePicker value={range} onChange={reset(setRange)} placeholder="Ngày tiếp nhận" aria-label="Ngày tiếp nhận" />
          </Suspense>
        </div>
      </FilterBar>
      <DataTable
        columns={columns}
        data={leads.data?.data ?? []}
        total={leads.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={leads.isLoading}
        isError={leads.isError}
        onRetry={() => void leads.refetch()}
        getRowId={(l) => l.id}
        empty={{
          title: 'Chưa có lead nào',
          description: 'Tiếp nhận khách hàng tiềm năng đầu tiên để bắt đầu.',
        }}
      />
    </>
  );
}
