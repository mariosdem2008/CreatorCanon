// apps/web/src/components/hub/EditorialAtlas/blocks/MetaTagPill.tsx
import type { ReactNode } from 'react';
import { palette, type AccentKey } from '../tokens';
import { resolveAccentColor } from '@/lib/hub/manifest/empty-state';

type Props = {
  children: ReactNode;
  accent?: AccentKey | string;        // tolerant of arbitrary strings via resolveAccentColor
  variant?: 'soft' | 'outline';       // outline used when chrome already has color
  size?: 'sm' | 'xs';
};

export function MetaTagPill({ children, accent, variant = 'soft', size = 'sm' }: Props) {
  const key = resolveAccentColor(accent as never);
  const c = palette.accent[key];
  const sizeCls = size === 'xs'
    ? 'h-5 px-1.5 text-[10px]'
    : 'h-6 px-2 text-[11px]';

  if (variant === 'outline') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border ${sizeCls} font-medium`}
        style={{ borderColor: c.fg + '40', color: c.fg }}
      >{children}</span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${sizeCls} font-medium`}
      style={{ backgroundColor: c.wash, color: c.fg }}
    >{children}</span>
  );
}
