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
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Ask this hub</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Ask this hub</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        {`Ask questions and get answers grounded only in ${firstName}'s videos, transcripts, and published hub pages.`}
      </p>

      <div className="mt-8">
        <AskHubClient
          hubId={m.hubId}
          hubSlug={m.hubSlug}
          suggestedQuestions={MOCK_ANSWER_QUESTIONS}
          initialQuestion={searchParams.q ?? ''}
        />
      </div>
    </HubShell>
  );
}
