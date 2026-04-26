// apps/web/src/components/hub/EditorialAtlas/blocks/TopicGrid.tsx
import type { Topic } from '@/lib/hub/manifest/schema';
import { TopicCard } from './TopicCard';

type Props = { topics: Topic[]; hubSlug: string; columns?: 2 | 3 | 4 };

export function TopicGrid({ topics, hubSlug, columns = 3 }: Props) {
  const colCls = columns === 4 ? 'lg:grid-cols-4' : columns === 2 ? 'sm:grid-cols-2' : 'lg:grid-cols-3 sm:grid-cols-2';
  return (
    <div className={`grid gap-3 ${colCls}`}>
      {topics.map((t) => <TopicCard key={t.id} topic={t} hubSlug={hubSlug} />)}
    </div>
  );
}
