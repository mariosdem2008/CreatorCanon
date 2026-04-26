// apps/web/src/components/hub/EditorialAtlas/ask/SuggestedQuestions.tsx
'use client';

type Props = { questions: readonly string[]; onPick: (q: string) => void };

export function SuggestedQuestions({ questions, onPick }: Props) {
  return (
    <ul className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <li key={q}>
          <button
            type="button" onClick={() => onPick(q)}
            className="inline-flex items-center rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612] hover:bg-[#FAF6EE]"
          >{q}</button>
        </li>
      ))}
    </ul>
  );
}
