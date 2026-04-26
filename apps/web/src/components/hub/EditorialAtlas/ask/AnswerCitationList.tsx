// apps/web/src/components/hub/EditorialAtlas/ask/AnswerCitationList.tsx
import type { AskResponse } from '@/lib/hub/chat/schema';

import { ChatSourceCard } from './ChatSourceCard';

type Citation = Extract<AskResponse, { citations: unknown[] }>['citations'][number];
type Props = { citations: Citation[] };

export function AnswerCitationList({ citations }: Props) {
  if (citations.length === 0) return null;
  return (
    <section>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Sources used</h3>
      <ol className="mt-2 grid gap-2 sm:grid-cols-2">
        {citations.map((c) => <li key={c.id}><ChatSourceCard citation={c} /></li>)}
      </ol>
    </section>
  );
}
