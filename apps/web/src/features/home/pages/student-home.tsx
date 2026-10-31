import { PlaceholderPage } from '@/components/common/placeholder-page';
import { ConfirmClassBanner } from '@/features/enrollments';

export default function StudentHome() {
  return (
    <div className="space-y-6">
      <ConfirmClassBanner />
      <PlaceholderPage title="Trang của tôi" />
    </div>
  );
}
