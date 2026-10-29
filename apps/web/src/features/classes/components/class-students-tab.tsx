import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import type { ClassStudentDto } from '@lc/shared';
import { can } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { useClassRoster } from '../hooks';

const LIMIT = 20;

const columns: ColumnDef<ClassStudentDto>[] = [
  { id: 'studentCode', header: 'Mã HV', accessorKey: 'studentCode' },
  {
    id: 'fullName',
    header: 'Họ tên',
    cell: ({ row }) => (
      <Link to={`/students/${row.original.studentId}`} className="font-medium hover:underline">
        {row.original.fullName}
      </Link>
    ),
  },
  {
    id: 'absenceRate',
    header: 'Tỷ lệ vắng',
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1 tabular-nums">
        {Math.round(row.original.absenceRate * 100)}%
        {row.original.warning ? (
          <AlertTriangle
            className="h-4 w-4 text-warning"
            role="img"
            aria-label="Cảnh báo vắng nhiều"
          />
        ) : null}
      </span>
    ),
  },
];

export default function ClassStudentsTab() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const roster = useClassRoster(id, page, LIMIT);

  return (
    <div className="space-y-3">
      {can(user, 'classes.manage') ? (
        <div className="flex justify-end">
          <Button asChild variant="outline">
            <Link to="/enrollments/waiting">Xếp thêm</Link>
          </Button>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        data={roster.data?.data ?? []}
        total={roster.data?.meta.total ?? 0}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        isLoading={roster.isLoading}
        isError={roster.isError}
        onRetry={() => void roster.refetch()}
        getRowId={(r) => r.enrollmentId}
        empty={{ title: 'Lớp chưa có học viên', description: 'Xếp học viên vào lớp từ danh sách chờ xếp lớp.' }}
      />
    </div>
  );
}
