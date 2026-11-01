import type { ReactNode } from 'react';

export function StatCard({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div data-testid={`stat-${label}`} className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{children}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
