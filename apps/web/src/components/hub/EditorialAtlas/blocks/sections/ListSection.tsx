// apps/web/src/components/hub/EditorialAtlas/blocks/sections/ListSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'list' }>;
  citationsById?: Record<string, Citation>;
};

export function ListSection({ section, citationsById }: Props) {
  const Tag = section.ordered ? 'ol' : 'ul';
  const listClass = section.ordered ? '[list-style:decimal]' : '[list-style:disc]';
  return (
    <section>
      <Tag className={`space-y-1.5 pl-5 text-[13px] leading-[1.55] text-[#3D352A] ${listClass}`}>
        {section.items.map((it, i) => <li key={i}>{it}</li>)}
      </Tag>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
