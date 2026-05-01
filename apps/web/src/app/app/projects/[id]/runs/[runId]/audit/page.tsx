import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ChannelProfileCard } from '@/components/audit/ChannelProfileCard';
import { VisualMomentsList } from '@/components/audit/VisualMomentsList';
import { VideoIntelligenceCardList } from '@/components/audit/VideoIntelligenceCardList';
import { CanonGraphView } from '@/components/audit/CanonGraphView';
import { PageBriefsList } from '@/components/audit/PageBriefsList';
import { HubSourceV2View } from '@/components/audit/HubSourceV2View';
import { getRunAudit } from '@/lib/audit/get-run-audit';

import { AuditActions } from './AuditClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit review' };

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: { id: string; runId: string };
  searchParams: { debug?: string };
}) {
  const audit = await getRunAudit(params.runId);
  if (!audit) notFound();
  if (audit.projectId !== params.id) notFound();

  const isReady = audit.status === 'audit_ready';
  const isRunning = audit.status === 'running' || audit.status === 'queued';
  const debugMode = searchParams?.debug === '1';

  // Detect schema version from the channel profile payload.
  const channelPayload = audit.channelProfile?.payload as { schemaVersion?: string } | null;
  const isV2 = channelPayload?.schemaVersion === 'v2';

  return (
    <main className="mx-auto max-w-4xl space-y-4">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
          {isV2 ? 'Hub source document (v2)' : 'Run audit'}
        </p>
        <h1 className="mt-1 text-[24px] font-semibold leading-tight text-[var(--cc-ink)]">
          {isReady
            ? isV2
              ? 'Your hub is ready to preview'
              : 'Your audit is ready for review'
            : isRunning
              ? 'Auditing your videos…'
              : 'Audit'}
        </h1>
        <p className="mt-1 text-[13px] leading-[1.55] text-[var(--cc-ink-3)]">
          {isV2
            ? <>This is what your hub will look like. Each canon node renders as a full hub page; each brief is the page&rsquo;s framing layer. Click <strong>Copy Hub Source</strong> to hand the full document off to the builder.</>
            : <>We&rsquo;ve analyzed your source videos and produced a build plan. Review the plan below; click <strong>Generate Hub</strong> when you want us to author the pages.</>}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--cc-ink-4)]">
          <span>Audit cost so far: ${(audit.costCents / 100).toFixed(2)}</span>
          {isV2 ? (
            debugMode ? (
              <Link
                href={`/app/projects/${audit.projectId}/runs/${audit.runId}/audit`}
                className="rounded-[6px] border border-[var(--cc-rule)] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
              >
                Hide internal fields
              </Link>
            ) : (
              <Link
                href={`/app/projects/${audit.projectId}/runs/${audit.runId}/audit?debug=1`}
                className="rounded-[6px] border border-dashed border-[var(--cc-rule)] bg-transparent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-3)] hover:border-[var(--cc-ink-4)]"
              >
                Show internal fields (operator)
              </Link>
            )
          ) : null}
        </div>
      </header>

      {isV2 ? (
        <HubSourceV2View
          channelProfile={audit.channelProfile}
          canonNodes={audit.canonNodes}
          pageBriefs={audit.pageBriefs}
          debug={debugMode}
          segmentById={new Map(Object.entries(audit.segmentMap))}
          youtubeIdByVideoId={audit.youtubeIdByVideoId}
          workshopStages={audit.workshopStages}
        />
      ) : (
        <>
          <ChannelProfileCard profile={audit.channelProfile} />
          <VisualMomentsList moments={audit.visualMoments} />
          <VideoIntelligenceCardList cards={audit.videoIntelligenceCards} />
          <CanonGraphView nodes={audit.canonNodes} />
          <PageBriefsList briefs={audit.pageBriefs} canonNodes={audit.canonNodes} />
        </>
      )}

      {audit.costByStage.length > 0 ? (
        <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
          <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">Stage cost breakdown</h2>
          <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
            What this audit cost us so far, by pipeline stage.
          </p>
          <ul className="mt-3 divide-y divide-[var(--cc-rule)]/60 text-[13px]">
            {audit.costByStage.map((s) => (
              <li
                key={s.stage}
                className="flex items-baseline justify-between py-1.5"
              >
                <span className="font-mono text-[12px] text-[var(--cc-ink-2)]">{s.stage}</span>
                <span className="tabular-nums text-[var(--cc-ink-3)]">
                  ${(s.costCents / 100).toFixed(2)}
                </span>
              </li>
            ))}
            <li className="flex items-baseline justify-between py-1.5">
              <span className="text-[12px] font-semibold text-[var(--cc-ink)]">Total</span>
              <span className="tabular-nums font-semibold text-[var(--cc-ink)]">
                ${(audit.costCents / 100).toFixed(2)}
              </span>
            </li>
          </ul>
        </section>
      ) : null}

      <AuditActions
        runId={audit.runId}
        projectId={audit.projectId}
        isReady={isReady}
        schemaVersion={isV2 ? 'v2' : 'v1-legacy'}
      />
    </main>
  );
}
