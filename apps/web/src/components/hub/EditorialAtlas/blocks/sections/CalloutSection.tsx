// apps/web/src/components/hub/EditorialAtlas/blocks/sections/CalloutSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'callout' }>;
  citationsById?: Record<string, Citation>;
};

const TONE_STYLES = {
  note:    'border-[#3A6E92]/25 bg-[#E2EDF4]/40 text-[#3A6E92]',
  warn:    'border-[#A07424]/25 bg-[#F4EAD2]/40 text-[#A07424]',
  success: 'border-[#5C7C56]/25 bg-[#E6EEDF]/40 text-[#5C7C56]',
} as const;

const TONE_LABEL = {
  note: 'Note',
  warn: 'Watch out',
  success: 'Win',
} as const;

export function CalloutSection({ section, citationsById }: Props) {
  return (
    <section>
      <div className={`rounded-[10px] border p-4 ${TONE_STYLES[section.tone]}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em]">
          {TONE_LABEL[section.tone]}
        </p>
        <p className="mt-2 text-[13px] leading-[1.55] text-[#1A1612]">{section.body}</p>
      </div>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
