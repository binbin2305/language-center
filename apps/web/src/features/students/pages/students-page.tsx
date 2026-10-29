import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ALL_STUDENT_STATUSES, type StudentBriefDto, type StudentDto, type StudentStatus,
} from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { FilterBar } from '@/components/common/filter-bar';
import { PageHeader } from '@/components/common/page-header';
import { SearchInput } from '@/components/common/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/lib/format';
// TODO W1-MERGE: use useCourses from features/courses (L-CATALOG).
import { useCourseOptions } from '@/features/admissions/course-options';
import { StatusBadge } from '@/components/common/status-badge';
import { useStudents } from '../hooks';
import { statusLabel } from '@/lib/status';

const ALL = 'ALL';
const LIMIT = 20;
type Row = StudentDto | StudentBriefDto;

export default function StudentsPage() {
  const [searchParams] = useSearchParams();
  // The class filter has no picker yet (class lists belong to L-CLASSES); deep links pass ?classId=.
  const classId = searchParams.get('classId') ?? undefined;
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StudentStatus | undefined>();
  const [courseId, setCourseId] = useState<string | undefined>();
  const courses = useCourseOptions();
  const students = useStudents({ page, limit: LIMIT, q: q || undefined, status, courseId, classId });

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { accessorKey: 'code', header: 'Mã HV' },
      {
        accessorKey: 'fullName',
        header: 'Họ tên',
        cell: ({ row }) => (
          <Link className="font-medium hover:underline" to={`/students/${row.original.id}`}>
            {row.original.fullName}
          </Link>
        ),
      },
      { id: 'dob', header: 'Ngày sinh', meta: { hideOnMobile: true }, cell: ({ row }) => formatDate(row.original.dob) },
      { accessorKey: 'phone', header: 'SĐT' },
      { id: 'status', header: 'Trạng thái', cell: ({ row }) => <StatusBadge group="student" value={row.original.status} /> },
    ],
    [],
  );

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader title="Học viên" description="Danh sách học viên" />
      <FilterBar>
        <SearchInput
          value={q}
          onChange={reset(setQ)}
          placeholder="Tìm theo mã, tên, SĐT, email"
          aria-label="Tìm học viên"
          className="w-64"
        />
        <Select
          value={status ?? ALL}
          onValueChange={(v) => reset(setStatus)(v === ALL ? undefined : ALL_STUDENT_STATUSES.find((s) => s === v))}
        >
          <SelectTrigger className="w-44" aria-label="Trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
            {ALL_STUDENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{statusLabel('student', s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={courseId ?? ALL} onValueChange={(v) => reset(setCourseId)(v === ALL ? undefined : v)}>
          <SelectTrigger className="w-52" aria-label="Khóa học">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả khóa học</SelectItem>
            {(courses.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>
      <DataTable
        columns={columns}
        data={students.data?.data ?? []}
        total={students.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={students.isLoading}
        isError={students.isError}
        onRetry={() => void students.refetch()}
        getRowId={(s) => s.id}
        empty={{ title: 'Không tìm thấy học viên', description: 'Thử đổi từ khóa hoặc bộ lọc.' }}
      />
    </>
  );
}
