import { forwardRef } from 'react';
import { AttendanceStatus } from '@lc/shared';
import { cn } from '@/lib/utils';

export const STATUS_OPTIONS: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: AttendanceStatus.PRESENT, label: 'Có mặt', active: 'border-success bg-success/15 text-success' },
  { value: AttendanceStatus.LATE, label: 'Muộn', active: 'border-warning bg-warning/15 text-warning' },
  { value: AttendanceStatus.EXCUSED, label: 'Vắng CP', active: 'border-info bg-info/15 text-info' },
  { value: AttendanceStatus.UNEXCUSED, label: 'Vắng KP', active: 'border-destructive bg-destructive/15 text-destructive' },
];

export interface StatusSegmentedProps {
  name: string;
  value: AttendanceStatus | null;
  disabled?: boolean;
  onChange: (value: AttendanceStatus) => void;
}

/** Four touch-sized buttons (min 44px); the first one is focusable from outside to jump to a row. */
export const StatusSegmented = forwardRef<HTMLButtonElement, StatusSegmentedProps>(function StatusSegmented(
  { name, value, disabled, onChange },
  ref,
) {
  return (
    <div role="group" aria-label={`Trạng thái ${name}`} className="grid grid-cols-4 gap-1.5">
      {STATUS_OPTIONS.map((o, i) => (
        <button
          key={o.value}
          ref={i === 0 ? ref : undefined}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-md border px-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            value === o.value ? o.active : 'border-input bg-background text-muted-foreground hover:bg-accent',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
});
