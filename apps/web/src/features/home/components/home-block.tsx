import type { ReactNode } from 'react';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';

/** A titled card on the mobile home: handles loading and error so each block fails on its own. */
export function HomeBlock({
  title,
  query,
  children,
  errorOverride,
}: {
  title: string;
  query: { isLoading: boolean; isError: boolean; refetch: () => unknown };
  children: ReactNode;
  errorOverride?: ReactNode;
}) {
  return (
    <section aria-label={title} className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {query.isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {query.isError ? (errorOverride ?? <ErrorState onRetry={() => void query.refetch()} />) : null}
      {!query.isLoading && !query.isError ? children : null}
    </section>
  );
}
