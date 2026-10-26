import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, type StatusGroup, type StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

const SOLID: Record<StatusTone, string> = {
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/15 text-warning',
  info: 'border-transparent bg-info/15 text-info',
  destructive: 'border-transparent bg-destructive/15 text-destructive',
  muted: 'border-transparent bg-muted text-muted-foreground',
  primary: 'border-transparent bg-primary/15 text-primary',
};
const OUTLINE: Record<StatusTone, string> = {
  success: 'border-success bg-transparent text-success',
  warning: 'border-warning bg-transparent text-warning',
  info: 'border-info bg-transparent text-info',
  destructive: 'border-destructive bg-transparent text-destructive',
  muted: 'border-muted-foreground bg-transparent text-muted-foreground',
  primary: 'border-primary bg-transparent text-primary',
};

export interface StatusBadgeProps {
  group: StatusGroup;
  value: string;
  /** Invoice past due date: adds an outlined "Quá hạn" badge next to the status. */
  overdue?: boolean;
}

export function StatusBadge({ group, value, overdue }: StatusBadgeProps) {
  const meta = STATUS_LABELS[group][value] ?? { label: value, tone: 'muted' as const };
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant="outline" className={cn(meta.outline ? OUTLINE[meta.tone] : SOLID[meta.tone], meta.strike && 'line-through')}>
        {meta.label}
      </Badge>
      {overdue ? (
        <Badge variant="outline" className={OUTLINE.destructive}>
          {STATUS_LABELS.invoice.OVERDUE?.label ?? 'Quá hạn'}
        </Badge>
      ) : null}
    </span>
  );
}
