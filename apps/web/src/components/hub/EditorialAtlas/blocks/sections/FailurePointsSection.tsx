// apps/web/src/components/hub/EditorialAtlas/blocks/sections/FailurePointsSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'failure_points' }>;
  citationsById?: Record<string, Citation>;
};

export function FailurePointsSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Common failure points</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {section.items.map((item, i) => (
          <li
            key={i}
            className="rounded-[10px] border border-[#A34A60]/25 bg-[#F4E1E6]/30 p-4"
          >
            <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-[#1A1612]">{item.title}</h3>
            <p className="mt-1.5 text-[12px] leading-[1.55] text-[#3D352A]">{item.body}</p>
          </li>
        ))}
      </ul>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
