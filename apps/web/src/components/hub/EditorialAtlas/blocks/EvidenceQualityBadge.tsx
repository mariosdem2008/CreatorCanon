// apps/web/src/components/hub/EditorialAtlas/blocks/EvidenceQualityBadge.tsx
import { MetaTagPill } from './MetaTagPill';

type Props = { quality: 'strong' | 'moderate' | 'limited' | 'none' };

const LABELS = {
  strong:   { label: 'Strong evidence',   accent: 'sage' },
  moderate: { label: 'Moderate evidence', accent: 'amber' },
  limited:  { label: 'Limited evidence',  accent: 'rose' },
  none:     { label: 'No evidence',       accent: 'slate' },
} as const;

export function EvidenceQualityBadge({ quality }: Props) {
  const { label, accent } = LABELS[quality];
  return <MetaTagPill accent={accent}>{label}</MetaTagPill>;
}
