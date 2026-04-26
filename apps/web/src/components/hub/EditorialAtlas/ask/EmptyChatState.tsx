// apps/web/src/components/hub/EditorialAtlas/ask/EmptyChatState.tsx
import { LineIllustration } from '../illustrations';
import { SuggestedQuestions } from './SuggestedQuestions';

type Props = { suggestedQuestions: readonly string[]; onPick: (q: string) => void };

export function EmptyChatState({ suggestedQuestions, onPick }: Props) {
  return (
    <div className="px-1 py-2 text-center">
      <div className="mx-auto text-[#3D352A]">
        <LineIllustration illustrationKey="open-notebook" className="mx-auto h-[96px] w-[144px]" />
      </div>
      <p className="mt-5 text-[13px] leading-[1.55] text-[#6B5F50]">Try one of these to start.</p>
      <div className="mt-4 flex justify-center">
        <SuggestedQuestions questions={suggestedQuestions} onPick={onPick} />
      </div>
    </div>
  );
}
