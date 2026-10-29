import type { StudentStatus } from '@lc/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STUDENT_STATUS_LABELS } from '../student-labels';

// TODO W1-MERGE: replace with StatusBadge group="student" (docs/contract-requests/L-ADMISSIONS-1.md).
export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  const meta = STUDENT_STATUS_LABELS[status];
  return (
    <Badge variant="outline" className={cn(meta.className)}>
      {meta.label}
    </Badge>
  );
}
