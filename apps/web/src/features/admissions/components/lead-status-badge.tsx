import { Badge } from '@/components/ui/badge';
import type { LeadStatus } from '@lc/shared';
import { cn } from '@/lib/utils';

// TODO W1-MERGE: replace with StatusBadge group="lead" once lib/status.ts has it
// (see docs/contract-requests/L-ADMISSIONS-1.md).
export const LEAD_STATUS_LABELS: Record<LeadStatus, { label: string; className: string }> = {
  NEW: { label: 'Mới', className: 'border-transparent bg-info/15 text-info' },
  PROFILE_CREATED: { label: 'Đã tạo hồ sơ', className: 'border-transparent bg-success/15 text-success' },
  CANCELLED: { label: 'Đã hủy', className: 'border-transparent bg-muted text-muted-foreground' },
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const meta = LEAD_STATUS_LABELS[status];
  return (
    <Badge variant="outline" className={cn(meta.className)}>
      {meta.label}
    </Badge>
  );
}
