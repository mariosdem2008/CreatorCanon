// apps/web/src/components/hub/EditorialAtlas/blocks/sections/WorkflowSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'workflow' }>;
  citationsById?: Record<string, Citation>;
};

export function WorkflowSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Workflow</h2>
      <div className="overflow-hidden rounded-[10px] border border-[#E5DECF] bg-white">
        <ul className="divide-y divide-[#E5DECF]">
          {section.schedule.map((day, i) => (
            <li key={i} className="grid grid-cols-[120px_1fr] gap-4 px-4 py-3">
              <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">
                {day.day}
              </span>
              <ul className="space-y-1 text-[13px] text-[#3D352A]">
                {day.items.map((it, j) => (
                  <li key={j} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-[#9A8E7C]" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
