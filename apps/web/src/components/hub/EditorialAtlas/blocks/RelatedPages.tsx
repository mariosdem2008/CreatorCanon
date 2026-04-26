// apps/web/src/components/hub/EditorialAtlas/blocks/RelatedPages.tsx
import type { Page } from '@/lib/hub/manifest/schema';
import { PageCard } from './PageCard';

type Props = {
  pages: Page[];
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
  layout?: 'grid' | 'rail';
};

export function RelatedPages({ pages, hubSlug, topicAccentBySlug, layout = 'grid' }: Props) {
  if (pages.length === 0) return null;
  return (
    <section>
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">Related pages</h2>
      <div className={layout === 'rail' ? 'mt-3 space-y-2' : 'mt-3 grid gap-3 md:grid-cols-3'}>
        {pages.map((p) => <PageCard key={p.id} page={p} hubSlug={hubSlug} topicAccentBySlug={topicAccentBySlug} />)}
      </div>
    </section>
  );
}
