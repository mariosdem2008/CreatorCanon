import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] text-[13px] font-medium leading-none transition-all duration-[120ms] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--paper)]',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--ink)] text-[var(--paper)] hover:bg-[#D9DEE5]',
        secondary:
          'border border-[var(--rule-strong)] bg-[var(--paper-2)] text-[var(--ink)] hover:border-[var(--ink-4)] hover:bg-[var(--paper-3)]',
        ghost:
          'text-[var(--ink-2)] hover:bg-[var(--paper-3)] hover:text-[var(--ink)]',
        accent:
          'bg-[var(--amber)] text-[var(--paper)] hover:bg-[#27F2A4]',
        destructive:
          'bg-[var(--rose)] text-white hover:bg-[#E62727]',
        link: 'text-[var(--amber-ink)] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2.5 text-[12px]',
        default: 'h-[34px] px-3.5 py-2',
        lg: 'h-10 px-5 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
