// apps/web/src/components/hub/EditorialAtlas/ask/ChatSourceCard.tsx
import type { AskResponse } from '@/lib/hub/chat/schema';

type Citation = Extract<AskResponse, { citations: unknown[] }>['citations'][number];
type Props = { citation: Citation };

export function ChatSourceCard({ citation }: Props) {
  return (
    <a
      href={citation.url} target="_blank" rel="noreferrer"
      className="block rounded-[10px] border border-[#E5DECF] bg-white p-3 transition-colors hover:border-[#D6CFC0] hover:bg-[#FAF6EE]"
    >
      <p className="text-[12px] font-semibold text-[#1A1612] line-clamp-2">{citation.videoTitle}</p>
      <p className="mt-1 text-[11px] text-[#9A8E7C]">Watch at {citation.timestampLabel}</p>
      <p className="mt-2 text-[12px] italic leading-[1.5] text-[#3D352A] line-clamp-3">{`“${citation.excerpt}”`}</p>
    </a>
  );
}
