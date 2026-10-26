import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface MoneyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onChange: (value: number | null) => void;
}

// Same dot grouping as formatVnd, without the currency sign.
const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Integer-VND input: dots as thousands separators, digits only, emits number | null. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, className, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <Input
        {...rest}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={cn('pr-8 text-right tabular-nums', className)}
        value={value === null ? '' : group(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 12);
          const next = digits === '' ? null : Number(digits);
          if (next !== value) onChange(next);
        }}
      />
      <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted-foreground" aria-hidden="true">
        ₫
      </span>
    </div>
  );
});
