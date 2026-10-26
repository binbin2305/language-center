import { formatVnd } from '@/lib/format';
import { cn } from '@/lib/utils';

export function MoneyText({ value, className }: { value: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatVnd(value)}</span>;
}
