import Link from 'next/link';
import { redirect } from 'next/navigation';

import { FLAT_PRICE_CENTS, formatUsdCents } from '@creatorcanon/core';
import { getDb, inArray } from '@creatorcanon/db';
import { video } from '@creatorcanon/db/schema';
import { getSourceCoverage, type SourceCoverageSummary } from '@creatorcanon/pipeline';

import {
  MetricCard,
  NoticeBanner,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
} from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

import { checkSourceCoverage } from './actions';
import { CheckSourceButton } from './ConfigureButtons';
import { ConfigureClient } from './ConfigureClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Configure Hub' };

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams?: { ids?: string; error?: string };
}) {
  const { workspaceId } = await requireWorkspace();
  const idsParam = searchParams?.ids ?? '';
  const videoIds = idsParam
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (videoIds.length === 0) redirect('/app/library');

  const db = getDb();
  const selectedVideos = await db
    .select({ id: video.id, title: video.title, durationSeconds: video.durationSeconds })
    .from(video)
    .where(inArray(video.id, videoIds));

  if (selectedVideos.length === 0) redirect('/app/library');

  const totalSeconds = selectedVideos.reduce(
    (acc, item) => acc + (item.durationSeconds ?? 0),
    0,
  );
  const sourceCoverage = await getSourceCoverage({ workspaceId, videoIds });
  const coverage = sourceCoverageCopy(sourceCoverage);
  const hasUnknownVideos = sourceCoverage.unknownCount > 0;
  const coveredCount = sourceCoverage.readyCount + sourceCoverage.transcribableCount;
  const requiresLimitedSourceConfirmation = coveredCount === 0;
  const showSourceRequiredError = searchParams?.error === 'source_required';

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Configure hub"
        title="Configure the hub Atlas will generate."
        body="Edit the form on the left — the right pane updates instantly to show how your hub will look once it's built."
        actions={
          <Link
            href="/app/library"
            className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
          >
            Change sources
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Videos" value={selectedVideos.length} sub="Selected sources" />
        <MetricCard label="Scope" value={fmtDuration(totalSeconds)} sub="Source runtime" />
        <MetricCard
          label="Source ready"
          value={sourceCoverage.readyCount}
          sub={`${sourceCoverage.transcribableCount} transcribable`}
          tone={sourceCoverage.readyCount > 0 ? 'success' : 'default'}
        />
        <MetricCard
          label="Price"
          value={formatUsdCents(FLAT_PRICE_CENTS)}
          sub="Alpha flat rate"
        />
      </div>

      {showSourceRequiredError ? (
        <NoticeBanner
          tone="warn"
          badge="Heads up"
          title="Source confirmation required."
          body="These videos do not have confirmed transcript support yet. Choose captioned videos, check transcript support, or explicitly continue with a limited-source hub."
        />
      ) : null}

      <Panel>
        <PanelHeader
          title="Atlas source assessment"
          meta={
            <span className="inline-flex items-center gap-2">
              <StatusPill tone={coverage.tone}>{coverage.title}</StatusPill>
              <span className="text-[11px] text-[var(--cc-ink-4)]">
                {sourceCoverage.readyCount} ready · {sourceCoverage.transcribableCount} extractable ·{' '}
                {sourceCoverage.unknownCount} unchecked · {sourceCoverage.unavailableCount} limited
              </span>
            </span>
          }
        />
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="flex-1 min-w-[260px] text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
            {coverage.body}
          </p>
          {hasUnknownVideos ? (
            <form action={checkSourceCoverage}>
              <input type="hidden" name="video_ids" value={videoIds.join(',')} />
              <CheckSourceButton />
            </form>
          ) : null}
        </div>
      </Panel>

      <ConfigureClient
        videoIds={videoIds}
        selectedVideoCount={selectedVideos.length}
        totalSeconds={totalSeconds}
        requiresLimitedSourceConfirmation={requiresLimitedSourceConfirmation}
        priceLabel={formatUsdCents(FLAT_PRICE_CENTS)}
      />
    </div>
  );
}

function sourceCoverageCopy(coverage: SourceCoverageSummary): {
  title: string;
  body: string;
  tone: 'success' | 'warn' | 'neutral';
} {
  if (coverage.estimatedSourceQuality === 'strong') {
    return {
      title: 'Strong coverage',
      body:
        'Selected videos have confirmed transcript support — generated sections can be grounded with source moments.',
      tone: 'success',
    };
  }
  if (coverage.estimatedSourceQuality === 'partial') {
    return {
      title: 'Partial coverage',
      body:
        'Some videos have transcript support and some need extraction. Atlas can proceed, but a few sections may need closer review.',
      tone: 'warn',
    };
  }
  return {
    title: 'Limited coverage',
    body:
      'No selected videos have confirmed captions yet. Continue only if you accept a lower-confidence first draft.',
    tone: 'neutral',
  };
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
