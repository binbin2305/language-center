import { useAuth } from '@/auth/use-auth';
import { PageHeader } from '@/components/common/page-header';
import { StudentResultCards } from '../components/result-cards';

export default function MyResultsPage() {
  const { user } = useAuth();
  return (
    <section>
      <PageHeader title="Kết quả của tôi" />
      <StudentResultCards studentId={user?.studentId} />
    </section>
  );
}
