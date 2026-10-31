import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth/use-auth';
import { InvoiceTable } from './invoice-table';

/** Tab "Học phí lớp". */
export default function ClassFeesTab() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  return <InvoiceTable filters={{ classId: id }} teacher={user?.role === 'TEACHER'} />;
}
