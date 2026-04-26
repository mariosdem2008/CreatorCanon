// apps/web/src/components/hub/EditorialAtlas/ask/UserTurn.tsx
//
// Right-aligned bubble that displays the question the reader just asked.
// Editorial-style: warm-paper fill, hairline border, calm — not a flashy
// gradient bubble.

type Props = { question: string };

export function UserTurn({ question }: Props) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[640px] rounded-[14px] border border-[#E5DECF] bg-[#F2EBDA] px-4 py-3 text-[14px] leading-[1.55] text-[#1A1612]">
        {question}
      </p>
    </div>
  );
}
