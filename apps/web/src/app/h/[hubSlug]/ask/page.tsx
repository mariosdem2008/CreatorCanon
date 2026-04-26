// apps/web/src/app/h/[hubSlug]/ask/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { MOCK_ANSWER_QUESTIONS } from '@/lib/hub/chat/mockAnswers';
import { getAskRoute } from '@/lib/hub/routes';

import { AskHubClient } from './AskHubClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ask this hub' };

export default function AskPage({
  params,
  searchParams,
}: {
  params: { hubSlug: string };
  searchParams: { q?: string };
}) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const firstName = m.creator.name.split(' ')[0];
  return (
    <HubShell manifest={m} activePathname={getAskRoute(params.hubSlug)}>
      <div className="mx-auto w-full max-w-[760px]">
        <header className="border-b border-[#E5DECF] pb-4">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Ask this hub</h1>
          <p className="mt-1 text-[12px] text-[#9A8E7C]">
            {`Answers grounded in ${firstName}'s videos, transcripts, and pages.`}
          </p>
        </header>

        <div className="mt-6">
          <AskHubClient
            hubId={m.hubId}
            hubSlug={m.hubSlug}
            suggestedQuestions={MOCK_ANSWER_QUESTIONS}
            initialQuestion={searchParams.q ?? ''}
          />
        </div>
      </div>
    </HubShell>
  );
}
