import { useParams } from 'react-router-dom';
import { InvoiceTable } from './invoice-table';

/** Tab "Học phí" of a student profile. */
export default function StudentFeesTab() {
  const { id = '' } = useParams();
  return <InvoiceTable filters={{ studentId: id }} />;
}
