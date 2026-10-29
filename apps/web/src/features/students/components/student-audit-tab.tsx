import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import type { AuditLogDto } from '@lc/shared';
import { DataTable } from '@/components/common/data-table';
import { formatDateTime } from '@/lib/format';
import { useStudentAudit } from '../hooks';

const LIMIT = 20;
const ACTION_LABELS: Record<AuditLogDto['action'], string> = {
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
  status: 'Đổi trạng thái',
};
const FIELD_LABELS: Record<string, string> = {
  fullName: 'Họ tên', dob: 'Ngày sinh', gender: 'Giới tính', phone: 'SĐT', email: 'Email',
  address: 'Địa chỉ', status: 'Trạng thái', note: 'Ghi chú', documents: 'Giấy tờ',
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const show = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** One "Field: before → after" line per changed field. */
export function changeLines(row: AuditLogDto): string[] {
  const before = asRecord(row.before);
  const after = asRecord(row.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${FIELD_LABELS[k] ?? k}: ${show(before[k])} → ${show(after[k])}`);
}

/** Tab "Lịch sử thay đổi" (M, S): paginated audit trail. */
export default function StudentAuditTab() {
  const { id = '' } = useParams();
  const [page, setPage] = useState(1);
  const audit = useStudentAudit(id, page, LIMIT);

  const columns = useMemo<ColumnDef<AuditLogDto>[]>(
    () => [
      { id: 'at', header: 'Thời gian', cell: ({ row }) => formatDateTime(row.original.at) },
      { id: 'action', header: 'Thao tác', cell: ({ row }) => ACTION_LABELS[row.original.action] },
      { accessorKey: 'actorRole', header: 'Vai trò', meta: { hideOnMobile: true } },
      {
        id: 'changes',
        header: 'Thay đổi',
        cell: ({ row }) => (
          <ul className="space-y-0.5">
            {changeLines(row.original).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={audit.data?.data ?? []}
      total={audit.data?.meta.total ?? 0}
      page={page}
      limit={LIMIT}
      onPageChange={setPage}
      isLoading={audit.isLoading}
      isError={audit.isError}
      onRetry={() => void audit.refetch()}
      getRowId={(r) => r.id}
      empty={{ title: 'Chưa có thay đổi nào', description: 'Các lần sửa hồ sơ sẽ hiện ở đây.' }}
    />
  );
}
