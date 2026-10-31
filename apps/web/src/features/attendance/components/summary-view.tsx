import type { ReactNode } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/error-messages';

/** Loading / error / empty frame shared by the attendance summary views. */
export function QueryFrame({
  query,
  isEmpty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  isEmpty: boolean;
  children: ReactNode;
}) {
  if (query.isError) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (query.isPending) return <Skeleton className="h-40 w-full" />;
  if (isEmpty) return <EmptyState title="Chưa có dữ liệu điểm danh" />;
  return <>{children}</>;
}
