// apps/web/src/components/hub/EditorialAtlas/blocks/sections/StepsSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'steps' }>;
  citationsById?: Record<string, Citation>;
};

export function StepsSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">{section.title}</h2>
      <ol className="space-y-3">
        {section.items.map((item, i) => (
          <li key={i} className="flex gap-4">
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-full bg-[#F2EBDA] text-[12px] font-semibold tabular-nums text-[#3D352A] [font-feature-settings:'tnum']"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold tracking-[-0.005em] text-[#1A1612]">{item.title}</h3>
              <p className="mt-0.5 text-[13px] leading-[1.55] text-[#3D352A]">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
