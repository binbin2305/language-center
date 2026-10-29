// TODO W1-MERGE: this is the ONLY file other catalog features import from settings.
// Promote applyServerFieldErrors / viParams to lib, and the badge to StatusBadge groups
// 'course' | 'room' | 'user' (see docs/contract-requests/L-CATALOG-1.md and -2.md).
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ParseParams } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiError } from '@/lib/api';

const FALLBACK_MESSAGE = 'Giá trị chưa hợp lệ. Kiểm tra lại ô này.';

/** zod parse params giving each form field one Vietnamese message (shared zod texts are developer-facing). */
export const viParams = (messages: Record<string, string>): ParseParams => ({
  path: [],
  async: false,
  errorMap: (issue) => ({ message: messages[String(issue.path[0] ?? '')] ?? FALLBACK_MESSAGE }),
});

/**
 * Maps server `details.fields` onto form fields. Server values are codes (e.g. DUPLICATE),
 * so DUPLICATE becomes `duplicateMessages[field]`; other codes use the generic text.
 * Returns true when at least one field error was set.
 */
export function applyServerFieldErrors<V extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<V>,
  duplicateMessages: Record<string, string>,
): boolean {
  if (!(error instanceof ApiError) || !error.details?.fields) return false;
  const entries = Object.entries(error.details.fields);
  for (const [field, code] of entries) {
    const message = code === 'DUPLICATE' ? (duplicateMessages[field] ?? FALLBACK_MESSAGE) : FALLBACK_MESSAGE;
    setError(field as Path<V>, { type: 'server', message });
  }
  return entries.length > 0;
}

const STATUS_META = {
  ACTIVE: { label: 'Đang hoạt động', variant: 'default' },
  ARCHIVED: { label: 'Đã lưu trữ', variant: 'secondary' },
  INACTIVE: { label: 'Ngừng hoạt động', variant: 'secondary' },
  LOCKED: { label: 'Đã khóa', variant: 'destructive' },
  DISABLED: { label: 'Đã vô hiệu', variant: 'secondary' },
} as const;
export type CatalogStatus = keyof typeof STATUS_META;
export const catalogStatusLabel = (s: CatalogStatus) => STATUS_META[s].label;

// TODO W1-MERGE: StatusBadge group 'course' | 'room' | 'user'
export function CatalogStatusBadge({ value }: { value: CatalogStatus }) {
  const m = STATUS_META[value];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

const ALL = '__all__';

export interface OptionSelectProps {
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  /** Adds a leading "all" option that maps to the empty string (filters). */
  allLabel?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
  className?: string;
}

/** Thin wrapper over components/ui/select for a flat list of string options. */
export function OptionSelect({ options, value, onValueChange, allLabel, className, ...aria }: OptionSelectProps) {
  return (
    <Select value={value === '' && allLabel ? ALL : value} onValueChange={(v) => onValueChange(v === ALL ? '' : v)}>
      <SelectTrigger className={className} {...aria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allLabel ? <SelectItem value={ALL}>{allLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
