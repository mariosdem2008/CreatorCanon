// apps/web/src/components/hub/EditorialAtlas/blocks/sections/CommonMistakesSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'common_mistakes' }>;
  citationsById?: Record<string, Citation>;
};

export function CommonMistakesSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Common mistakes</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {section.items.map((item, i) => (
          <li
            key={i}
            className="rounded-[10px] border border-[#A07424]/20 bg-[#F4EAD2]/30 p-4"
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
