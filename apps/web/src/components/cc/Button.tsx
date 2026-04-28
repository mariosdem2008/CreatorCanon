import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-[8px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--cc-canvas)] disabled:opacity-60 disabled:cursor-not-allowed';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--cc-accent)] text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] hover:bg-[var(--cc-accent-strong)]',
  secondary:
    'bg-white text-[var(--cc-ink)] border border-[var(--cc-rule)] hover:border-[var(--cc-ink-4)]',
  ghost:
    'bg-transparent text-[var(--cc-ink-2)] hover:bg-[var(--cc-surface-2)] hover:text-[var(--cc-ink)]',
  danger:
    'bg-[var(--cc-danger)] text-white hover:bg-[#dc2626]',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-9 px-3.5 text-[13px]',
};

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
} & ComponentProps<'button'>;

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button {...rest} className={cn(base, variants[variant], sizes[size], className)}>
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {children}
    </Link>
  );
}
