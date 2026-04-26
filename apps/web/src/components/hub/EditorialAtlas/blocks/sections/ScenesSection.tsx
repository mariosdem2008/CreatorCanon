// apps/web/src/components/hub/EditorialAtlas/blocks/sections/ScenesSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'scenes' }>;
  citationsById?: Record<string, Citation>;
};

export function ScenesSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Scenes</h2>
      <ol className="space-y-2.5">
        {section.items.map((item, i) => (
          <li
            key={i}
            className="flex gap-4 rounded-[10px] border border-[#E5DECF] bg-[#FAF6EE]/40 p-4"
          >
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-[11px] font-semibold tabular-nums text-[#6B5F50] [font-feature-settings:'tnum']"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-semibold tracking-[-0.005em] text-[#1A1612]">{item.title}</h3>
              <p className="mt-1 text-[12px] leading-[1.55] text-[#3D352A]">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
