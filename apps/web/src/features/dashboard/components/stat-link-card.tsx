import { Link } from 'react-router-dom';

export function StatLinkCard({
  label,
  value,
  to,
}: {
  label: string;
  value: number | undefined;
  to?: string;
}) {
  const body = (
    <div
      data-testid={`stat-${label}`}
      className="min-h-[44px] rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '—'}</p>
    </div>
  );
  return to ? (
    <Link
      to={to}
      className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {body}
    </Link>
  ) : (
    body
  );
}
