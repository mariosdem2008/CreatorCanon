// apps/web/src/components/hub/EditorialAtlas/ask/UnsupportedAnswerState.tsx
import Link from 'next/link';

import type { AskResponse } from '@/lib/hub/chat/schema';
import { getSearchRoute, getTopicRoute } from '@/lib/hub/routes';

type Props = {
  hubSlug: string;
  response: Extract<AskResponse, { unsupported: true }>;
};

export function UnsupportedAnswerState({ hubSlug, response }: Props) {
  return (
    <article className="space-y-4 rounded-[14px] border border-[#E5DECF] bg-white p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Not enough source support</p>
      <p className="rounded-[10px] border border-[#E5DECF] bg-[#FAF6EE] p-4 text-[14px] leading-[1.55] text-[#3D352A]">{response.message}</p>

      {response.suggestedSearches.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Try searching</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {response.suggestedSearches.map((s) => (
              <li key={s}>
                <Link href={getSearchRoute(hubSlug, s)} className="inline-flex rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612]">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {response.partialMatches.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Or browse</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {response.partialMatches.map((m) => (
              <li key={`${m.type}-${m.slug}`}>
                <Link
                  href={m.type === 'topic' ? getTopicRoute(hubSlug, m.slug) : '#'}
                  className="inline-flex rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612]"
                >
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
