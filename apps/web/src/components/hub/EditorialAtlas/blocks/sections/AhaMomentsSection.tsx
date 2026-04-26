// apps/web/src/components/hub/EditorialAtlas/blocks/sections/AhaMomentsSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'aha_moments' }>;
  citationsById?: Record<string, Citation>;
};

export function AhaMomentsSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Aha moments</h2>
      <ul className="space-y-3">
        {section.items.map((item, i) => (
          <li key={i} className="rounded-[10px] border-l-2 border-[#A07424] bg-[#FAF6EE] py-3 pl-5 pr-4">
            <p className="text-[15px] italic leading-[1.55] text-[#1A1612]">{`“${item.quote}”`}</p>
            {item.attribution && (
              <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-[#9A8E7C]">
                — {item.attribution}
              </p>
            )}
          </li>
        ))}
      </ul>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
