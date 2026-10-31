import type { ClassDto } from '@lc/shared';

export interface ClassChoiceListProps {
  groups: { label: string; classes: ClassDto[] }[];
  value: string;
  onChange: (id: string) => void;
  name: string;
}

/** Radio list of classes, one labelled group per section (empty groups are hidden). */
export function ClassChoiceList({ groups, value, onChange, name }: ClassChoiceListProps) {
  return (
    <div className="space-y-3">
      {groups
        .filter((g) => g.classes.length > 0)
        .map((g) => (
          <div key={g.label} role="group" aria-label={g.label} className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{g.label}</p>
            {g.classes.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                <input
                  type="radio"
                  name={name}
                  value={c.id}
                  checked={value === c.id}
                  onChange={() => onChange(c.id)}
                />
                <span>
                  {c.name} ({c.code}) - {c.level} - {c.currentSize}/{c.maxCapacity}
                </span>
              </label>
            ))}
          </div>
        ))}
    </div>
  );
}
