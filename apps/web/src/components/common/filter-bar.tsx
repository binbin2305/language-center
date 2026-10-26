import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label="Bộ lọc" className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>
      {children}
    </div>
  );
}
