import type { CSSProperties } from 'react';

import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

export type CreatorManualCardStyle = CSSProperties & {
  '--cm-card-index'?: string;
  '--cm-type-color'?: string;
};

export const creatorManualTypeColor = (manifest: CreatorManualManifest, type?: string) =>
  (type ? manifest.brand.tokens.colors.typeMap?.[type] : null) ??
  manifest.brand.tokens.colors.accent;

export const creatorManualCardStyle = ({
  index,
  typeColor,
}: {
  index?: number;
  typeColor?: string;
}): CreatorManualCardStyle => {
  const style: CreatorManualCardStyle = {};

  if (typeof index === 'number') {
    style['--cm-card-index'] = String(index);
  }

  if (typeColor) {
    style['--cm-type-color'] = typeColor;
  }

  return style;
};
