import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  delayMs?: number;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
}

/** Controlled search box: shows keystrokes immediately, emits `onChange` after `delayMs` of silence. */
export function SearchInput({
  value,
  onChange,
  delayMs = 300,
  placeholder = 'Tìm kiếm...',
  'aria-label': ariaLabel = 'Tìm kiếm',
  className,
}: SearchInputProps) {
  const [local, setLocal] = useState(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Follow external resets (e.g. "clear filters").
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        role="searchbox"
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="pl-8"
        value={local}
        onChange={(e) => {
          const next = e.target.value;
          setLocal(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChangeRef.current(next), delayMs);
        }}
      />
    </div>
  );
}
