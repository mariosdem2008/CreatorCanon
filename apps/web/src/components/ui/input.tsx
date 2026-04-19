import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'h-[34px] w-full rounded-[var(--r-sm)] border border-[var(--rule-strong)] bg-[var(--paper)] px-2.5 text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-4)] outline-none transition-[border-color,box-shadow] duration-[120ms]',
          'focus:border-[var(--ink-3)] focus:shadow-[0_0_0_3px_oklch(0.85_0.008_85_/_0.5)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
