// apps/web/src/components/hub/EditorialAtlas/blocks/sections/PrinciplesSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'principles' }>;
  citationsById?: Record<string, Citation>;
};

export function PrinciplesSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Principles</h2>
      <ul className="grid gap-3 md:grid-cols-3">
        {section.items.map((item, i) => (
          <li
            key={i}
            className="rounded-[10px] border border-[#E5DECF] bg-white p-4"
          >
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-[8px] bg-[#F2EBDA] text-[#3D352A]"
            >
              <span className="size-2.5 rounded-full bg-current" />
            </span>
            <h3 className="mt-3 text-[13px] font-semibold tracking-[-0.005em] text-[#1A1612]">{item.title}</h3>
            <p className="mt-1.5 text-[12px] leading-[1.55] text-[#3D352A]">{item.body}</p>
          </li>
        ))}
      </ul>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
