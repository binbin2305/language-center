import type { GradeClass } from '@lc/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GRADE_CLASS_LABELS } from '../labels';

const TONE: Record<GradeClass, string> = {
  EXCELLENT: 'border-transparent bg-success/15 text-success',
  GOOD: 'border-transparent bg-info/15 text-info',
  FAIR: 'border-transparent bg-primary/15 text-primary',
  AVERAGE: 'border-transparent bg-warning/15 text-warning',
  FAIL: 'border-transparent bg-destructive/15 text-destructive',
};

export const formatScore = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

export function GradeClassBadge({ value }: { value: GradeClass | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={cn(TONE[value])}>
      {GRADE_CLASS_LABELS[value]}
    </Badge>
  );
}
