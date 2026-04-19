'use client';

import * as React from 'react';

import { Icon } from '@atlas/ui';

import { cn } from '@/lib/utils';

export interface FAQItemProps {
  q: string;
  a: string;
  defaultOpen?: boolean;
}

export function FAQItem({ q, a, defaultOpen = false }: FAQItemProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="border-t border-rule first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-6 py-5 text-left transition-colors hover:bg-paper-2"
      >
        <span className="text-heading-md text-ink">{q}</span>
        <Icon
          name="chevDown"
          size={16}
          className={cn(
            'shrink-0 text-ink-3 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0">
          <p className="pb-5 pr-10 text-body-md text-ink-3">{a}</p>
        </div>
      </div>
    </div>
  );
}
