import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
