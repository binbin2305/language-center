import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { can } from '@lc/shared';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/common/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/auth/use-auth';
import { formatDate } from '@/lib/format';
import { ConvertDialog } from '../components/convert-dialog';
import { StatusBadge } from '@/components/common/status-badge';
import { useCourseOptions } from '../course-options';
import { useLead } from '../hooks';

const GENDERS = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' } as const;

export default function LeadDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const lead = useLead(id);
  const courses = useCourseOptions();
  const [convertOpen, setConvertOpen] = useState(false);

  if (lead.isLoading || lead.isError || !lead.data)
    return (
      <>
        <PageHeader title="Chi tiết lead" breadcrumb={[{ label: 'Tuyển sinh', to: '/admissions/leads' }]} />
        {lead.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ErrorState onRetry={() => void lead.refetch()} />
        )}
      </>
    );
  const l = lead.data;
  const courseName = courses.data?.find((c) => c.id === l.interestedCourseId)?.name ?? '—';
  const rows: Array<[string, string]> = [
    ['Họ tên', l.fullName],
    ['Ngày sinh', formatDate(l.dob)],
    ['Giới tính', GENDERS[l.gender]],
    ['SĐT', l.phone],
    ['Email', l.email ?? '—'],
    ['Địa chỉ', l.address || '—'],
    ['Khóa quan tâm', courseName],
    ['Ngày tiếp nhận', formatDate(l.createdAt)],
    ['Ghi chú', l.note || '—'],
  ];

  return (
    <>
      <PageHeader
        title={l.fullName}
        breadcrumb={[{ label: 'Tuyển sinh', to: '/admissions/leads' }, { label: 'Chi tiết lead' }]}
        actions={
          <>
            <StatusBadge group="lead" value={l.status} />
            {l.status === 'NEW' && can(user, 'students.create') ? (
              <Button onClick={() => setConvertOpen(true)}>Tạo hồ sơ học viên</Button>
            ) : null}
            {l.status === 'PROFILE_CREATED' && l.studentId ? (
              <Button asChild variant="outline">
                <Link to={`/students/${l.studentId}`}>Xem hồ sơ học viên</Link>
              </Button>
            ) : null}
          </>
        }
      />
      <dl className="grid max-w-2xl gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <ConvertDialog lead={l} open={convertOpen} onOpenChange={setConvertOpen} />
    </>
  );
}
