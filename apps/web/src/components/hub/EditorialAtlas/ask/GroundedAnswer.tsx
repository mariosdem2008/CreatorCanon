// apps/web/src/components/hub/EditorialAtlas/ask/GroundedAnswer.tsx
import Link from 'next/link';

import type { AskResponse } from '@/lib/hub/chat/schema';
import { EvidenceQualityBadge } from '../blocks/EvidenceQualityBadge';
import { getPageRoute } from '@/lib/hub/routes';

import { AnswerCitationList } from './AnswerCitationList';

type Props = {
  hubSlug: string;
  response: Extract<AskResponse, { citations: unknown[] }>;
};

export function GroundedAnswer({ hubSlug, response }: Props) {
  const { answer, citations, relatedPages, suggestedFollowups } = response;
  return (
    <article className="space-y-5 rounded-[14px] border border-[#E5DECF] bg-white p-6">
      <header className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Answer</p>
        <EvidenceQualityBadge quality={answer.evidenceQuality} />
      </header>

      <p className="text-[15px] leading-[1.6] text-[#1A1612]">{answer.summary}</p>

      <ul className="space-y-2">
        {answer.bullets.map((b, i) => (
          <li
            key={i}
            className={
              'rounded-[10px] border px-4 py-2.5 text-[13px] leading-[1.55] ' +
              (b.citationIds.length > 0
                ? 'border-[#E5DECF] bg-[#FAF6EE] text-[#3D352A]'
                : 'border-[#A34A60]/40 bg-[#F4E1E6]/40 text-[#A34A60]')
            }
          >
            {b.text}
            {b.citationIds.length === 0 && (
              <span className="ml-2 text-[10px] uppercase tracking-[0.12em]">No source attached</span>
            )}
          </li>
        ))}
      </ul>

      <AnswerCitationList citations={citations} />

      {relatedPages.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Related pages</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {relatedPages.map((p) => (
              <li key={p.id}>
                <Link href={getPageRoute(hubSlug, p.slug)} className="block rounded-[10px] border border-[#E5DECF] bg-[#FAF6EE] px-3 py-2 text-[12px] hover:border-[#D6CFC0]">
                  <span className="block font-medium text-[#1A1612]">{p.title}</span>
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-[#9A8E7C]">{p.type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestedFollowups.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Follow-up questions</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestedFollowups.map((q) => (
              <li key={q}>
                <button type="button" data-followup={q} className="inline-flex items-center rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612]">
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
