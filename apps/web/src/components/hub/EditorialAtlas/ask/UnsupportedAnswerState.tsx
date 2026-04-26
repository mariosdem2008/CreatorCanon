// apps/web/src/components/hub/EditorialAtlas/ask/UnsupportedAnswerState.tsx
//
// Flat, ChatGPT-style assistant turn for the no-source-support case. No
// bordered card — just a refusal sentence followed by quiet inline links
// for searches and topic browsing.

import Link from 'next/link';

import type { AskResponse } from '@/lib/hub/chat/schema';
import { getSearchRoute, getTopicRoute } from '@/lib/hub/routes';

type Props = {
  hubSlug: string;
  response: Extract<AskResponse, { unsupported: true }>;
};

export function UnsupportedAnswerState({ hubSlug, response }: Props) {
  return (
    <section className="space-y-3 px-1 text-[#1A1612]">
      <p className="text-[15px] leading-[1.65] text-[#3D352A]">{response.message}</p>

      {response.suggestedSearches.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 pt-1 text-[11px] leading-[1.5] text-[#6B5F50]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Try searching</span>
          {response.suggestedSearches.map((s, i) => (
            <span key={s} className="inline-flex items-baseline gap-1">
              {i > 0 && <span aria-hidden className="text-[#9A8E7C]">·</span>}
              <Link
                href={getSearchRoute(hubSlug, s)}
                className="hover:text-[#1A1612] hover:underline underline-offset-2"
              >
                {s}
              </Link>
            </span>
          ))}
        </p>
      )}

      {response.partialMatches.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-[11px] leading-[1.5] text-[#6B5F50]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Or browse</span>
          {response.partialMatches.map((m, i) => (
            <span key={`${m.type}-${m.slug}`} className="inline-flex items-baseline gap-1">
              {i > 0 && <span aria-hidden className="text-[#9A8E7C]">·</span>}
              <Link
                href={m.type === 'topic' ? getTopicRoute(hubSlug, m.slug) : '#'}
                className="hover:text-[#1A1612] hover:underline underline-offset-2"
              >
                {m.title}
              </Link>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
