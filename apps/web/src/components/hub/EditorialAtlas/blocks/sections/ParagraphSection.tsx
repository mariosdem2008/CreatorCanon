// apps/web/src/components/hub/EditorialAtlas/blocks/sections/ParagraphSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'paragraph' }>;
  citationsById?: Record<string, Citation>;
};

export function ParagraphSection({ section, citationsById }: Props) {
  return (
    <section>
      <p className="text-[14px] leading-[1.6] text-[#3D352A]">{section.body}</p>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
