import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { AssessmentDto } from '@lc/shared';
import { useAuth } from '@/auth/use-auth';
import { DataTable } from '@/components/common/data-table';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { ASSESSMENT_TYPE_LABELS } from '../labels';
import { canManageAssessments } from '../permissions';
import { useAssessments } from '../hooks';
import { AssessmentFormDialog } from './assessment-form-dialog';

export const assessmentStatus = (a: Pick<AssessmentDto, 'confirmedAt' | 'isLocked'>) =>
  a.isLocked ? 'LOCKED' : a.confirmedAt ? 'CONFIRMED' : 'DRAFT';

const columns: ColumnDef<AssessmentDto>[] = [
  {
    id: 'name',
    header: 'Tên bài',
    cell: ({ row }) => (
      <Link to={`/assessments/${row.original.id}/grades`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { id: 'type', header: 'Loại', cell: ({ row }) => ASSESSMENT_TYPE_LABELS[row.original.type] ?? row.original.type },
  { id: 'weight', header: 'Trọng số', cell: ({ row }) => `${row.original.weight}%` },
  { id: 'heldOn', header: 'Ngày', cell: ({ row }) => formatDate(row.original.heldOn) },
  {
    id: 'status',
    header: 'Trạng thái',
    cell: ({ row }) => <StatusBadge group="assessment" value={assessmentStatus(row.original)} />,
  },
];

export default function ClassAssessmentsTab() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const q = useAssessments(id);
  const [open, setOpen] = useState(false);
  const rows = q.data ?? [];
  const total = rows.reduce((s, a) => s + a.weight, 0);
  const canEnter = canManageAssessments(user);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tổng trọng số: <span className="font-medium text-foreground tabular-nums">{`${total}/100%`}</span>
        </p>
        {canEnter ? <Button onClick={() => setOpen(true)}>Thêm bài đánh giá</Button> : null}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        limit={Math.max(rows.length, 1)}
        onPageChange={() => undefined}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => void q.refetch()}
        getRowId={(a) => a.id}
        empty={{ title: 'Chưa có bài đánh giá', description: 'Thêm bài đánh giá để bắt đầu nhập điểm.' }}
      />
      {canEnter ? <AssessmentFormDialog classId={id} open={open} onOpenChange={setOpen} /> : null}
    </div>
  );
}
