import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Plain <select> styled like Input: label-able, keyboard-friendly and simple to test. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function NativeSelect({ className, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          className,
        )}
        {...rest}
      />
    );
  },
);
