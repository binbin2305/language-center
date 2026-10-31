import { useParams } from 'react-router-dom';
import { StudentResultCards } from './result-cards';

/** Tab "Kết quả" of the student detail page: the student id comes from the route. */
export default function StudentResultsTab() {
  const { id } = useParams();
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Kết quả</h2>
      <StudentResultCards studentId={id} />
    </div>
  );
}
