import { cn } from '@/lib/utils';

export function CapacityBar({ current, max, className }: { current: number; max: number; className?: string }) {
  const full = current >= max;
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label="Sĩ số"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={current}
        className="h-2 w-24 overflow-hidden rounded-full bg-muted"
      >
        <div
          data-testid="capacity-fill"
          className={cn('h-full rounded-full', full ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('text-sm tabular-nums', full && 'font-medium text-destructive')}>{`${current}/${max}`}</span>
    </div>
  );
}
