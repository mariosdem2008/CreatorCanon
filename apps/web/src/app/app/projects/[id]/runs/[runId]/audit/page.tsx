import { notFound } from 'next/navigation';

import { ChannelProfileCard } from '@/components/audit/ChannelProfileCard';
import { VisualMomentsList } from '@/components/audit/VisualMomentsList';
import { VideoIntelligenceCardList } from '@/components/audit/VideoIntelligenceCardList';
import { CanonGraphView } from '@/components/audit/CanonGraphView';
import { PageBriefsList } from '@/components/audit/PageBriefsList';
import { getRunAudit } from '@/lib/audit/get-run-audit';

import { AuditActions } from './AuditClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit review' };

export default async function AuditPage({
  params,
}: {
  params: { id: string; runId: string };
}) {
  const audit = await getRunAudit(params.runId);
  if (!audit) notFound();
  if (audit.projectId !== params.id) notFound();

  const isReady = audit.status === 'audit_ready';
  const isRunning = audit.status === 'running' || audit.status === 'queued';

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
          Run audit
        </p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight text-[var(--cc-ink)]">
          {isReady
            ? 'Your audit is ready for review'
            : isRunning
              ? 'Auditing your videos…'
              : 'Audit'}
        </h1>
        <p className="mt-1 text-[13px] leading-[1.55] text-[var(--cc-ink-3)]">
          We&rsquo;ve analyzed your source videos and produced a build plan. Review the plan below;
          click <strong>Generate Hub</strong> when you want us to author the pages.
        </p>
        <p className="mt-2 text-[11px] text-[var(--cc-ink-4)]">
          Audit cost so far: ${(audit.costCents / 100).toFixed(2)}
        </p>
      </header>

      <ChannelProfileCard profile={audit.channelProfile} />
      <VisualMomentsList moments={audit.visualMoments} />
      <VideoIntelligenceCardList cards={audit.videoIntelligenceCards} />
      <CanonGraphView nodes={audit.canonNodes} />
      <PageBriefsList briefs={audit.pageBriefs} />

      <AuditActions runId={audit.runId} projectId={audit.projectId} isReady={isReady} />
    </main>
  );
}
