// apps/web/src/components/hub/EditorialAtlas/ask/GroundedAnswer.tsx
//
// Flat, ChatGPT-style assistant turn. The answer reads as prose on the page
// (no bordered card, no big "Answer" header). Sources and related pages live
// as small footnote-style lines beneath the bullets. Bullets that lack a
// citation get a quiet "no source attached" suffix instead of a colored
// warning box — preserves the no-claim-without-source rule from the spec
// without breaking the conversational flow.

import Link from 'next/link';

import type { AskResponse } from '@/lib/hub/chat/schema';
import { getPageRoute } from '@/lib/hub/routes';

type Props = {
  hubSlug: string;
  response: Extract<AskResponse, { citations: unknown[] }>;
};

export function GroundedAnswer({ hubSlug, response }: Props) {
  const { answer, citations, relatedPages } = response;

  return (
    <section className="space-y-3 px-1 text-[#1A1612]">
      <p className="text-[15px] leading-[1.65]">{answer.summary}</p>

      {answer.bullets.length > 0 && (
        <ul className="space-y-1.5 pl-5 text-[14px] leading-[1.6] text-[#3D352A] [list-style:disc]">
          {answer.bullets.map((b, i) => (
            <li key={i}>
              <span>{b.text}</span>
              {b.citationIds.length === 0 && (
                <span className="ml-1.5 text-[11px] italic text-[#A34A60]">— no source attached</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {citations.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 pt-2 text-[11px] leading-[1.5] text-[#6B5F50]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Sources</span>
          {citations.map((c, i) => (
            <span key={c.id} className="inline-flex items-baseline gap-1">
              {i > 0 && <span aria-hidden className="text-[#9A8E7C]">·</span>}
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#1A1612] hover:underline underline-offset-2"
              >
                {c.videoTitle} <span className="tabular-nums text-[#9A8E7C]">{c.timestampLabel}</span>
              </a>
            </span>
          ))}
        </p>
      )}

      {relatedPages.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-[11px] leading-[1.5] text-[#6B5F50]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Related</span>
          {relatedPages.map((p, i) => (
            <span key={p.id} className="inline-flex items-baseline gap-1">
              {i > 0 && <span aria-hidden className="text-[#9A8E7C]">·</span>}
              <Link
                href={getPageRoute(hubSlug, p.slug)}
                className="hover:text-[#1A1612] hover:underline underline-offset-2"
              >
                {p.title}
              </Link>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
