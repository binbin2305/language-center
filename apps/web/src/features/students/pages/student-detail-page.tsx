import { TabbedDetail } from '@/layouts/tabbed-detail';
import { STUDENT_TABS } from '@/layouts/tab-slots';

/** Wave 0 frame: the students lane fills the header (name, code, status badge, Edit). */
export default function StudentDetailPage() {
  return <TabbedDetail title="Hồ sơ học viên" tabs={STUDENT_TABS} />;
}
