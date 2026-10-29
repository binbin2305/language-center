import { Badge } from '@/components/ui/badge';

const META = {
  ACTIVE: { label: 'Đang hoạt động', className: 'border-transparent bg-success/15 text-success' },
  ARCHIVED: { label: 'Đã lưu trữ', className: 'border-transparent bg-muted text-muted-foreground' },
  INACTIVE: { label: 'Ngừng hoạt động', className: 'border-transparent bg-muted text-muted-foreground' },
} as const;

/** Status badge for course/room status (no shared group exists for them). */
export function ActiveBadge({ value }: { value: keyof typeof META }) {
  const m = META[value];
  return (
    <Badge variant="outline" className={m.className}>
      {m.label}
    </Badge>
  );
}
