import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { apiGetPage } from '@/lib/api';
import { cn } from '@/lib/utils';

export type EntityKind = 'student' | 'class' | 'teacher' | 'room' | 'course';

const PATHS: Record<EntityKind, string> = {
  student: 'students',
  class: 'classes',
  teacher: 'teachers',
  room: 'rooms',
  course: 'courses',
};

export interface EntityItem {
  id: string;
  code?: string;
  name?: string;
  fullName?: string;
  [k: string]: unknown;
}

export const defaultEntityLabel = (e: EntityItem) =>
  [e.code, e.fullName ?? e.name].filter(Boolean).join(' - ') || e.id;

export interface EntitySelectProps {
  entity: EntityKind;
  value: string | null;
  onChange: (id: string | null, item?: EntityItem) => void;
  /** Extra query params, e.g. `{ status: 'ONGOING' }`. */
  filter?: Record<string, string | number | boolean | undefined>;
  renderLabel?: (item: EntityItem) => ReactNode;
  /** Label to show for `value` before the user picks anything (e.g. when editing). */
  selectedLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-label'?: string;
  debounceMs?: number;
}

export function EntitySelect({
  entity, value, onChange, filter, renderLabel = defaultEntityLabel, selectedLabel,
  placeholder = 'Chọn...', disabled, 'aria-label': ariaLabel, debounceMs = 300,
}: EntitySelectProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<EntityItem | undefined>();

  useEffect(() => {
    const t = setTimeout(() => setQ(input), debounceMs);
    return () => clearTimeout(t);
  }, [input, debounceMs]);

  const filterKey = JSON.stringify(filter ?? {});
  const query = useQuery({
    queryKey: ['entity-select', entity, q, filterKey],
    queryFn: () => apiGetPage<EntityItem>(PATHS[entity], { ...filter, q, limit: 20 }),
    enabled: open,
  });

  const shownPicked = picked && picked.id === value ? picked : undefined;
  const triggerText = shownPicked ? renderLabel(shownPicked) : value ? (selectedLabel ?? 'Đã chọn') : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Tìm kiếm..." value={input} onValueChange={setInput} />
          <CommandList>
            {query.isLoading ? <div className="px-3 py-2 text-sm text-muted-foreground">Đang tải...</div> : null}
            {query.isError ? <div className="px-3 py-2 text-sm text-destructive">Không tải được danh sách.</div> : null}
            {query.isSuccess && query.data.data.length === 0 ? <CommandEmpty>Không tìm thấy kết quả.</CommandEmpty> : null}
            {query.data?.data.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                onSelect={() => {
                  setPicked(item);
                  onChange(item.id, item);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', item.id === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                {renderLabel(item)}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
