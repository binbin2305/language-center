import { useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { useStudent } from '../hooks';
import { isFullView as isFull } from '../api';
import { GENDER_LABELS } from '../student-labels';
import { StatusBadge } from '@/components/common/status-badge';

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-0.5">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium">{children}</dd>
  </div>
);

const percent = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** Tab "Thông tin". */
export default function StudentInfoTab() {
  const { id = '' } = useParams();
  const student = useStudent(id);
  if (student.isLoading) return <Skeleton className="h-40 w-full" />;
  if (student.isError || !student.data)
    return <ErrorState onRetry={() => void student.refetch()} />;
  const s = student.data;

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Mã học viên">{s.code}</Row>
        <Row label="Họ và tên">{s.fullName}</Row>
        <Row label="Ngày sinh">{formatDate(s.dob)}</Row>
        <Row label="Số điện thoại">{s.phone}</Row>
        <Row label="Trạng thái">
          <StatusBadge group="student" value={s.status} />
        </Row>
        {isFull(s) ? (
          <>
            <Row label="Giới tính">{GENDER_LABELS[s.gender]}</Row>
            <Row label="Email">{s.email ?? '—'}</Row>
            <Row label="Địa chỉ">{s.address || '—'}</Row>
            <Row label="Ghi chú">{s.note || '—'}</Row>
          </>
        ) : null}
      </dl>
      {isFull(s) ? (
        <section aria-label="Tóm tắt">
          <h2 className="mb-2 text-base font-semibold">Tóm tắt</h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Row label="Chuyên cần">{percent(s.summary.attendanceRate)}</Row>
            <Row label="Điểm trung bình">{s.summary.averageScore ?? '—'}</Row>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
