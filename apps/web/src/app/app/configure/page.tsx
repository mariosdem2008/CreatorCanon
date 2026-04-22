import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { estimateRunPriceCents, formatUsdCents } from '@creatorcanon/core';
import { eq, getDb, inArray } from '@creatorcanon/db';
import { video, workspaceMember } from '@creatorcanon/db/schema';
import { getSourceCoverage, type SourceCoverageSummary } from '@creatorcanon/pipeline';

import { HUB_TEMPLATE_OPTIONS } from '@/components/hub/templates';
import { checkSourceCoverage, createProject } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Configure Hub' };

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function sourceCoverageCopy(coverage: SourceCoverageSummary) {
  if (coverage.estimatedSourceQuality === 'strong') {
    return {
      title: 'Source coverage looks strong',
      body: 'Every selected video has confirmed transcript support, so generated sections can be grounded with source moments.',
      className: 'border-sage/30 bg-sage/5 text-sage',
    };
  }
  if (coverage.estimatedSourceQuality === 'partial') {
    return {
      title: 'Partial source coverage',
      body: 'Some selected videos have transcript support and some do not. The hub can be generated, but a few sections may show limited-source labels.',
      className: 'border-amber/40 bg-amber-wash text-amber-ink',
    };
  }
  return {
    title: 'Limited source coverage',
    body: 'None of the selected videos have confirmed captions yet. Choose videos with captions, check transcript support, or explicitly continue with a limited-source hub.',
    className: 'border-rule-dark bg-paper-3 text-ink-3',
  };
}

function readinessLabel(label: SourceCoverageSummary['videos'][number]['readinessLabel']): string {
  if (label === 'source_ready') return 'Source ready';
  if (label === 'auto_captions') return 'Auto captions';
  if (label === 'needs_transcription') return 'Needs transcription';
  if (label === 'limited_source') return 'Limited source';
  return 'Needs transcript check';
}

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams?: { ids?: string; error?: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const idsParam = searchParams?.ids ?? '';
  const videoIds = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
  if (videoIds.length === 0) redirect('/app/library');

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  if (!members[0]) redirect('/app');

  const selectedVideos = await db
    .select({ id: video.id, title: video.title, durationSeconds: video.durationSeconds })
    .from(video)
    .where(inArray(video.id, videoIds));

  const totalSeconds = selectedVideos.reduce((acc, v) => acc + (v.durationSeconds ?? 0), 0);
  const price = formatUsdCents(estimateRunPriceCents(totalSeconds));
  const sourceCoverage = await getSourceCoverage({ workspaceId: members[0].workspaceId, videoIds });
  const coverageCopy = sourceCoverageCopy(sourceCoverage);
  const hasUnknownVideos = sourceCoverage.unknownCount > 0;
  const coveredCount = sourceCoverage.readyCount + sourceCoverage.transcribableCount;
  const requiresLimitedSourceConfirmation = coveredCount === 0;
  const showSourceRequiredError = searchParams?.error === 'source_required';

  return (
    <main className="min-h-screen bg-paper-studio">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-rule-dark bg-paper px-8 py-5">
        <div>
          <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
            Creator Studio
          </div>
          <h1 className="font-serif text-heading-lg text-ink">Configure your hub</h1>
        </div>
        <Link
          href="/app/library"
          className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
        >
          ← Back to library
        </Link>
      </div>

      <div className="mx-auto max-w-[720px] px-8 py-10">
        {/* Selection summary */}
        <div className="mb-8 rounded-lg border border-rule bg-paper p-5">
          <p className="mb-3 text-body-sm font-medium text-ink">
            {selectedVideos.length} video{selectedVideos.length !== 1 ? 's' : ''} selected
            {totalSeconds > 0 && (
              <span className="ml-2 text-ink-4">· {fmtDuration(totalSeconds)} total</span>
            )}
          </p>
          <ul className="space-y-1">
            {selectedVideos.slice(0, 5).map((v) => (
              <li key={v.id} className="text-body-sm text-ink-3 truncate">
                {v.title ?? 'Untitled'}
                {v.durationSeconds != null && (
                  <span className="ml-2 text-ink-5">{fmtDuration(v.durationSeconds)}</span>
                )}
              </li>
            ))}
            {selectedVideos.length > 5 && (
              <li className="text-body-sm text-ink-4">
                + {selectedVideos.length - 5} more
              </li>
            )}
          </ul>
        </div>

        {showSourceRequiredError && (
          <div className="mb-8 rounded-lg border border-amber/40 bg-amber-wash px-5 py-4 text-amber-ink">
            <p className="text-body-sm font-medium">Source confirmation required</p>
            <p className="mt-1 text-body-sm">
              These videos do not have confirmed transcript support yet. Choose captioned videos,
              check transcript support, or explicitly confirm that you want to continue with a
              limited-source hub.
            </p>
          </div>
        )}

        {/* Source coverage */}
        <div className={`mb-8 rounded-lg border p-5 ${coverageCopy.className}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-body-md font-medium">{coverageCopy.title}</p>
              <p className="mt-1 max-w-[560px] text-body-sm opacity-80">{coverageCopy.body}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-caption">
                <span className="rounded-full bg-paper/70 px-2 py-1 text-ink-3">
                  {sourceCoverage.readyCount} ready
                </span>
                <span className="rounded-full bg-paper/70 px-2 py-1 text-ink-3">
                  {sourceCoverage.transcribableCount} needs transcription
                </span>
                <span className="rounded-full bg-paper/70 px-2 py-1 text-ink-3">
                  {sourceCoverage.unknownCount} unchecked
                </span>
                <span className="rounded-full bg-paper/70 px-2 py-1 text-ink-3">
                  {sourceCoverage.unavailableCount} limited
                </span>
              </div>
            </div>
            {hasUnknownVideos && (
              <form action={checkSourceCoverage}>
                <input type="hidden" name="video_ids" value={videoIds.join(',')} />
                <button
                  type="submit"
                  className="inline-flex h-9 whitespace-nowrap items-center rounded-md border border-rule bg-paper px-3 text-body-sm font-medium text-ink transition hover:bg-paper-2"
                >
                  Check transcript support
                </button>
              </form>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {sourceCoverage.videos.slice(0, 5).map((row) => (
              <div key={row.videoId} className="flex items-center justify-between gap-3 rounded-md bg-paper/70 px-3 py-2">
                <span className="truncate text-body-sm text-ink">{row.title ?? 'Untitled'}</span>
                <span className="shrink-0 rounded-full border border-rule bg-paper px-2 py-0.5 text-caption text-ink-3">
                  {readinessLabel(row.readinessLabel)}
                </span>
              </div>
            ))}
            {sourceCoverage.videos.length > 5 && (
              <p className="text-caption opacity-70">
                + {sourceCoverage.videos.length - 5} more selected videos
              </p>
            )}
          </div>
        </div>

        {/* Config form */}
        <form action={createProject} className="space-y-6">
          <input type="hidden" name="video_ids" value={videoIds.join(',')} />

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-body-sm font-medium text-ink" htmlFor="title">
              Hub title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. The KeyBooks Productivity System"
              className="h-10 w-full rounded-md border border-rule bg-paper px-3 text-body-md text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-amber"
            />
          </div>

          {/* Audience */}
          <div>
            <label className="mb-1.5 block text-body-sm font-medium text-ink" htmlFor="audience">
              Target audience
              <span className="ml-1 font-normal text-ink-4">(optional)</span>
            </label>
            <input
              id="audience"
              name="audience"
              type="text"
              placeholder="e.g. Busy professionals who want to read more"
              className="h-10 w-full rounded-md border border-rule bg-paper px-3 text-body-md text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-amber"
            />
          </div>

          {/* Tone */}
          <div>
            <label className="mb-1.5 block text-body-sm font-medium text-ink">Tone</label>
            <div className="flex gap-2">
              {(['conversational', 'professional', 'academic'] as const).map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-rule bg-paper px-3 py-2 text-body-sm text-ink has-[:checked]:border-amber has-[:checked]:bg-amber/5"
                >
                  <input type="radio" name="tone" value={t} defaultChecked={t === 'conversational'} className="sr-only" />
                  <span className="capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Length preset */}
          <div>
            <label className="mb-1.5 block text-body-sm font-medium text-ink">Hub depth</label>
            <div className="flex gap-2">
              {([
                { key: 'short', label: 'Concise', desc: 'Key ideas only' },
                { key: 'standard', label: 'Standard', desc: 'Balanced depth' },
                { key: 'deep', label: 'Deep', desc: 'Full coverage' },
              ] as const).map(({ key, label, desc }) => (
                <label
                  key={key}
                  className="flex flex-1 cursor-pointer flex-col rounded-md border border-rule bg-paper px-3 py-2.5 text-body-sm has-[:checked]:border-amber has-[:checked]:bg-amber/5"
                >
                  <input type="radio" name="length_preset" value={key} defaultChecked={key === 'standard'} className="sr-only" />
                  <span className="font-medium text-ink">{label}</span>
                  <span className="text-ink-4">{desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Presentation preset */}
          <div>
            <label className="mb-1.5 block text-body-sm font-medium text-ink">
              Hub template
            </label>
            <div className="grid gap-3 md:grid-cols-3">
              {HUB_TEMPLATE_OPTIONS.map((template) => (
                <label
                  key={template.id}
                  className={`flex min-h-[160px] cursor-pointer flex-col rounded-lg border p-4 text-body-sm transition ${template.configureClassName}`}
                >
                  <input
                    type="radio"
                    name="presentation_preset"
                    value={template.id}
                    defaultChecked={template.id === 'paper'}
                    className="sr-only"
                  />
                  <span className="text-caption uppercase tracking-widest opacity-70">
                    {template.previewLabel}
                  </span>
                  <span className="mt-3 text-body-md font-medium">{template.name}</span>
                  <span className="mt-2 leading-6 opacity-75">{template.tagline}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-caption text-ink-4">
              This controls the public hub layout after publishing. You can keep the generated
              content contract identical while changing the reader experience.
            </p>
          </div>

          {/* Chat toggle */}
          <div className="flex items-center justify-between rounded-md border border-rule bg-paper px-4 py-3">
            <div>
              <p className="text-body-sm font-medium text-ink">Enable chat</p>
              <p className="text-body-sm text-ink-4">Viewers can ask questions about your content</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input type="checkbox" name="chat_enabled" value="true" defaultChecked className="sr-only peer" />
              <div className="h-5 w-9 rounded-full bg-rule peer-checked:bg-ink transition-colors" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </label>
          </div>

          {/* Price + submit */}
          <div className="flex items-center justify-between rounded-lg border border-rule-dark bg-paper p-5">
            <div>
              <p className="text-heading-sm font-medium text-ink">{price}</p>
              <p className="text-body-sm text-ink-4">
                {selectedVideos.length} video{selectedVideos.length !== 1 ? 's' : ''}
                {totalSeconds > 0 && ` · ${fmtDuration(totalSeconds)}`}
              </p>
              {requiresLimitedSourceConfirmation && (
                <label className="mt-3 flex max-w-md items-start gap-2 text-body-sm text-ink-3">
                  <input
                    type="checkbox"
                    name="allow_limited_source"
                    value="true"
                    required
                    className="mt-1"
                  />
                  <span>
                    I understand this hub may publish with limited source support because no
                    selected videos have confirmed captions.
                  </span>
                </label>
              )}
            </div>
            {requiresLimitedSourceConfirmation && (
              <Link href="/app/library" className="text-body-sm text-ink-3 underline">
                Choose videos with captions
              </Link>
            )}
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-6 text-body-sm font-medium text-paper transition hover:opacity-90"
            >
              {requiresLimitedSourceConfirmation ? 'Continue with limited-source hub' : 'Continue to payment'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
