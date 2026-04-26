// apps/web/src/app/h/[hubSlug]/ask/AskHubClient.tsx
//
// Chat-like surface for the Ask This Hub page:
// - Empty state shows the welcome + suggested questions when there are no turns.
// - Once a question is asked, the thread renders top-to-bottom (oldest first):
//     UserTurn (right-aligned bubble) → GroundedAnswer | UnsupportedAnswerState.
// - A "Thinking…" placeholder sits below the most recent question while the
//   mock API is in flight.
// - The composer is anchored at the foot of the thread; new turns extend the
//   page downward, and we scroll the latest answer into view.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AskHubInput } from '@/components/hub/EditorialAtlas/ask/AskHubInput';
import { EmptyChatState } from '@/components/hub/EditorialAtlas/ask/EmptyChatState';
import { GroundedAnswer } from '@/components/hub/EditorialAtlas/ask/GroundedAnswer';
import { UnsupportedAnswerState } from '@/components/hub/EditorialAtlas/ask/UnsupportedAnswerState';
import { UserTurn } from '@/components/hub/EditorialAtlas/ask/UserTurn';
import { askResponseSchema, type AskResponse } from '@/lib/hub/chat/schema';
import { getAskApiRoute } from '@/lib/hub/routes';

type Props = {
  hubId: string;
  hubSlug: string;
  suggestedQuestions: readonly string[];
  initialQuestion: string;
};

type Turn = { question: string; response: AskResponse };

export function AskHubClient({ hubId, hubSlug, suggestedQuestions, initialQuestion }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setPending(true);
    setPendingQuestion(trimmed);
    try {
      const res = await fetch(getAskApiRoute(hubSlug), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hubId, question: trimmed, filters: { topicSlugs: [], sourceVideoIds: [], pageIds: [] } }),
      });
      const json = await res.json();
      const parsed = askResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error('Bad response shape');
      setTurns((t) => [...t, { question: trimmed, response: parsed.data }]);
    } finally {
      setPending(false);
      setPendingQuestion(null);
    }
  }, [hubId, hubSlug]);

  // Pull the page query into the thread once on mount.
  useEffect(() => {
    if (initialQuestion.trim()) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll the most recent activity into view whenever the thread grows or a
  // request starts. `block: 'end'` keeps the composer in the viewport.
  useEffect(() => {
    if (turns.length === 0 && !pending) return;
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending]);

  const showEmpty = turns.length === 0 && !pending;

  return (
    <div className="flex flex-col gap-6">
      {/* Thread */}
      {showEmpty ? (
        <EmptyChatState suggestedQuestions={suggestedQuestions} onPick={ask} />
      ) : (
        <div className="space-y-6">
          {turns.map((t, i) => (
            <div key={i} className="space-y-4">
              <UserTurn question={t.question} />
              {'unsupported' in t.response && t.response.unsupported ? (
                <UnsupportedAnswerState hubSlug={hubSlug} response={t.response} />
              ) : (
                <GroundedAnswer hubSlug={hubSlug} response={t.response as Extract<AskResponse, { citations: unknown[] }>} />
              )}
            </div>
          ))}

          {pending && pendingQuestion && (
            <div className="space-y-4">
              <UserTurn question={pendingQuestion} />
              <ThinkingIndicator />
            </div>
          )}
        </div>
      )}

      {/* Anchor for auto-scroll-into-view */}
      <div ref={threadEndRef} aria-hidden />

      {/* Composer — anchored to the foot of the conversation. */}
      <AskHubInput pending={pending} onSubmit={ask} />
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div aria-label="Thinking" className="flex items-center gap-1 px-1 py-2 text-[#9A8E7C]">
      <span className="size-1.5 animate-pulse rounded-full bg-current" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </div>
  );
}
