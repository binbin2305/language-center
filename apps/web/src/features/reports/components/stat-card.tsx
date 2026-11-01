import type { ReactNode } from 'react';

export function StatCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div data-testid={`stat-${label}`} className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{children}</p>
    </div>
  );
}
