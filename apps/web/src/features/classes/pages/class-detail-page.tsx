import { TabbedDetail } from '@/layouts/tabbed-detail';
import { CLASS_TABS } from '@/layouts/tab-slots';

/** Wave 0 frame: the classes lane fills the header (code, teacher, status) and menu. */
export default function ClassDetailPage() {
  return <TabbedDetail title="Chi tiết lớp" tabs={CLASS_TABS} />;
}
