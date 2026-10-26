import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { vi } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { displayYmd, parseYmd, toYmd } from './date-utils';

export interface DateRangeValue {
  from: string | null;
  to: string | null;
}

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = 'Chọn khoảng ngày',
  disabled,
  'aria-label': ariaLabel = 'Chọn khoảng ngày',
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const from = parseYmd(value.from);
  const to = parseYmd(value.to);
  const text = from ? `${displayYmd(value.from)} - ${to ? displayYmd(value.to) : '...'}` : placeholder;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn('w-full justify-start font-normal', !from && 'text-muted-foreground')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
          {text}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={vi}
          weekStartsOn={1}
          numberOfMonths={2}
          selected={from ? { from, to } : undefined}
          defaultMonth={from}
          onSelect={(r) => {
            onChange({ from: r?.from ? toYmd(r.from) : null, to: r?.to ? toYmd(r.to) : null });
            if (r?.from && r.to) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
