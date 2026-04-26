// apps/web/src/app/h/[hubSlug]/ask/AskHubClient.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';

import { AskHubInput } from '@/components/hub/EditorialAtlas/ask/AskHubInput';
import { EmptyChatState } from '@/components/hub/EditorialAtlas/ask/EmptyChatState';
import { GroundedAnswer } from '@/components/hub/EditorialAtlas/ask/GroundedAnswer';
import { UnsupportedAnswerState } from '@/components/hub/EditorialAtlas/ask/UnsupportedAnswerState';
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

  const ask = useCallback(async (question: string) => {
    setPending(true);
    try {
      const res = await fetch(getAskApiRoute(hubSlug), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hubId, question, filters: { topicSlugs: [], sourceVideoIds: [], pageIds: [] } }),
      });
      const json = await res.json();
      const parsed = askResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error('Bad response shape');
      setTurns((t) => [...t, { question, response: parsed.data }]);
    } finally {
      setPending(false);
    }
  }, [hubId, hubSlug]);

  useEffect(() => {
    if (initialQuestion.trim()) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <AskHubInput pending={pending} onSubmit={ask} />

      {turns.length === 0 && !pending && (
        <EmptyChatState suggestedQuestions={suggestedQuestions} onPick={ask} />
      )}

      {turns.map((t, i) => (
        'unsupported' in t.response && t.response.unsupported ? (
          <UnsupportedAnswerState key={i} hubSlug={hubSlug} response={t.response} question={t.question} />
        ) : (
          <GroundedAnswer key={i} hubSlug={hubSlug} response={t.response as Extract<AskResponse, { citations: unknown[] }>} question={t.question} />
        )
      ))}
    </div>
  );
}
