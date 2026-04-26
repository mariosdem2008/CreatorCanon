// apps/web/src/components/hub/EditorialAtlas/ask/EmptyChatState.tsx
import { LineIllustration } from '../illustrations';
import { SuggestedQuestions } from './SuggestedQuestions';

type Props = { suggestedQuestions: readonly string[]; onPick: (q: string) => void };

export function EmptyChatState({ suggestedQuestions, onPick }: Props) {
  return (
    <div className="rounded-[14px] border border-[#E5DECF] bg-white p-8 text-center">
      <div className="mx-auto text-[#3D352A]">
        <LineIllustration illustrationKey="open-notebook" className="mx-auto h-[120px] w-[180px]" />
      </div>
      <p className="mt-6 text-[14px] leading-[1.55] text-[#3D352A] max-w-[480px] mx-auto">
        {`Try one of these questions, or type your own. Every answer is grounded only in this hub's videos and pages.`}
      </p>
      <div className="mt-6">
        <SuggestedQuestions questions={suggestedQuestions} onPick={onPick} />
      </div>
    </div>
  );
}
