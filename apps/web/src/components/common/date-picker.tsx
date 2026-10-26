import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { vi } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { displayYmd, parseYmd, toYmd } from './date-utils';

export interface DatePickerProps {
  /** `YYYY-MM-DD` (Vietnam day) or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Chọn ngày',
  disabled,
  'aria-label': ariaLabel,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          className={cn('w-full justify-start font-normal', !selected && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          {selected ? displayYmd(value) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={vi}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? toYmd(d) : null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
