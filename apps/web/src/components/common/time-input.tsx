import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';

export interface TimeInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** `HH:mm` or empty string. */
  value: string;
  onChange: (value: string) => void;
}

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { value, onChange, ...rest },
  ref,
) {
  return <Input {...rest} ref={ref} type="time" step={60} value={value} onChange={(e) => onChange(e.target.value)} />;
});
