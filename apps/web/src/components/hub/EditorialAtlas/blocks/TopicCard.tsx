// apps/web/src/components/hub/EditorialAtlas/blocks/TopicCard.tsx
import Link from 'next/link';

import type { Topic } from '@/lib/hub/manifest/schema';
import { palette } from '../tokens';
import { resolveAccentColor } from '@/lib/hub/manifest/empty-state';
import { getTopicRoute } from '@/lib/hub/routes';

type Props = { topic: Topic; hubSlug: string };

export function TopicCard({ topic, hubSlug }: Props) {
  const c = palette.accent[resolveAccentColor(topic.accentColor)];
  return (
    <Link
      href={getTopicRoute(hubSlug, topic.slug)}
      className="group block rounded-[12px] border border-[#E5DECF] bg-white p-5 transition-all hover:-translate-y-px hover:border-[#D6CFC0] hover:shadow-[0_4px_16px_rgba(26,22,18,0.06)]"
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-[8px]"
        style={{ backgroundColor: c.wash, color: c.fg }}
      >
        {/* Inline placeholder icon — Phase 3 wires Lucide via iconKey lookup. */}
        <span className="size-3 rounded-full bg-current" />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-[#1A1612]">{topic.title}</h3>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-[#6B5F50] line-clamp-2">{topic.description}</p>
      <p className="mt-3 text-[11px] text-[#9A8E7C]">{topic.pageCount} {topic.pageCount === 1 ? 'page' : 'pages'}</p>
    </Link>
  );
}
