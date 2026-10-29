import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { can } from '@lc/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TabbedDetail } from '@/layouts/tabbed-detail';
import { STUDENT_TABS } from '@/layouts/tab-slots';
import { useAuth } from '@/auth/use-auth';
import { StudentEditForm } from '../components/student-edit-form';
import { StatusBadge } from '@/components/common/status-badge';
import { isFullView } from '../api';
import { useStudent } from '../hooks';

function StudentHeader() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const student = useStudent(id);
  const [editing, setEditing] = useState(false);

  if (student.isLoading) return <Skeleton className="mt-2 h-8 w-72" />;
  const s = student.data;
  if (!s) return null;
  // Teachers receive the reduced view and cannot edit; the form needs the full profile.
  const full = isFullView(s) ? s : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <p className="text-lg font-medium">{s.fullName}</p>
      <span className="text-sm text-muted-foreground">{s.code}</span>
      <StatusBadge group="student" value={s.status} />
      {full && can(user, 'students.update') ? (
        <>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Sửa
          </Button>
          {editing ? <StudentEditForm student={full} open onOpenChange={setEditing} /> : null}
        </>
      ) : null}
    </div>
  );
}

export default function StudentDetailPage() {
  return <TabbedDetail title="Hồ sơ học viên" header={<StudentHeader />} tabs={STUDENT_TABS} />;
}
