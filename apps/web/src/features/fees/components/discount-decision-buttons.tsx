import { useState } from 'react';
import { toast } from 'sonner';
import { can } from '@lc/shared';
import { ReasonDialog } from '@/components/common/reason-dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/use-auth';
import { errorMessage } from '@/lib/error-messages';
import { useDecideDiscount } from '../hooks';

/** Duyệt / Từ chối a pending discount (Manager only). */
export function DiscountDecisionButtons({ invoiceId }: { invoiceId: string }) {
  const { user } = useAuth();
  const decide = useDecideDiscount();
  const [rejecting, setRejecting] = useState(false);
  if (!can(user, 'discounts.decide')) return null;
  const run = (approve: boolean, note?: string) =>
    decide.mutate(
      { id: invoiceId, approve, note },
      {
        onSuccess: () => {
          toast.success(approve ? 'Đã duyệt giảm giá' : 'Đã từ chối giảm giá');
          setRejecting(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={decide.isPending} onClick={() => run(true)}>Duyệt</Button>
      <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => setRejecting(true)}>Từ chối</Button>
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Từ chối giảm giá"
        submitLabel="Từ chối"
        isPending={decide.isPending}
        onSubmit={(note) => run(false, note)}
      />
    </div>
  );
}
