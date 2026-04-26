// apps/web/src/components/hub/EditorialAtlas/blocks/sections/WhyItWorksSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'why_it_works' }>;
  citationsById?: Record<string, Citation>;
};

export function WhyItWorksSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Why it works</h2>
      <p className="text-[14px] leading-[1.6] text-[#3D352A]">{section.body}</p>
      {section.points && section.points.length > 0 && (
        <ul className="mt-2 space-y-1.5 pl-5 text-[13px] leading-[1.55] text-[#3D352A] [list-style:disc]">
          {section.points.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
