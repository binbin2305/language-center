import { useParams } from 'react-router-dom';
import { InvoiceTable } from './invoice-table';

/** Tab "Học phí lớp". */
export default function ClassFeesTab() {
  const { id = '' } = useParams();
  return <InvoiceTable filters={{ classId: id }} />;
}
