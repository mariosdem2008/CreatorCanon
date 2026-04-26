// apps/web/src/components/hub/EditorialAtlas/blocks/sections/OverviewSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'overview' }>;
  citationsById?: Record<string, Citation>;
};

export function OverviewSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Overview</h2>
      <p className="text-[14px] leading-[1.6] text-[#3D352A]">{section.body}</p>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
