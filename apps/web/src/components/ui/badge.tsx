import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium tracking-[0.01em] transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-[var(--rule)] bg-[var(--paper-2)] text-[var(--ink-2)]',
        amber:
          'border-[oklch(0.88_0.04_75)] bg-[var(--amber-wash)] text-[var(--amber-ink)]',
        sage:
          'border-[oklch(0.88_0.03_160)] bg-[var(--sage-wash)] text-[var(--sage)]',
        rose:
          'border-[oklch(0.88_0.04_25)] bg-[var(--rose-wash)] text-[var(--rose)]',
        ink: 'border-transparent bg-[var(--ink)] text-[var(--paper)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
