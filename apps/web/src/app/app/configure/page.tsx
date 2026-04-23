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
      dotClass: 'bg-sage',
      wrapperClass: 'border-sage/30 bg-sage/8',
      textClass: 'text-sage',
      bodyClass: 'text-ink-3',
    };
  }
  if (coverage.estimatedSourceQuality === 'partial') {
    return {
      title: 'Partial source coverage',
      body: 'Some selected videos have transcript support and some do not. The hub can be generated, but a few sections may show limited-source labels.',
      dotClass: 'bg-amber',
      wrapperClass: 'border-amber/40 bg-amber-wash',
      textClass: 'text-amber-ink',
      bodyClass: 'text-amber-ink/80',
    };
  }
  return {
    title: 'Limited source coverage',
    body: 'None of the selected videos have confirmed captions yet. Choose videos with captions, check transcript support, or explicitly continue with a limited-source hub.',
    dotClass: 'bg-ink-4',
    wrapperClass: 'border-rule-dark bg-paper-3',
    textClass: 'text-ink-3',
    bodyClass: 'text-ink-4',
  };
}

function readinessLabel(label: SourceCoverageSummary['videos'][number]['readinessLabel']): {
  text: string;
  className: string;
} {
  if (label === 'source_ready') return { text: 'Source ready', className: 'text-sage bg-sage/10 border-sage/20' };
  if (label === 'auto_captions') return { text: 'Auto captions', className: 'text-amber-ink bg-amber-wash border-amber/20' };
  if (label === 'needs_transcription') return { text: 'Needs transcription', className: 'text-amber-ink bg-amber-wash border-amber/20' };
  if (label === 'limited_source') return { text: 'Limited source', className: 'text-ink-4 bg-paper-3 border-rule' };
  return { text: 'Unchecked', className: 'text-ink-4 bg-paper-3 border-rule' };
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
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
        >
          <span aria-hidden="true">←</span>
          Back to library
        </Link>
      </div>

      <div className="mx-auto max-w-[720px] px-8 py-10">
        {/* Selection summary */}
        <div className="mb-8 overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="border-b border-rule bg-paper-2 px-5 py-3">
            <p className="text-eyebrow uppercase tracking-widest text-ink-4">Selection</p>
          </div>
          <div className="px-5 py-4">
            <p className="mb-3 text-body-sm font-medium text-ink">
              {selectedVideos.length} video{selectedVideos.length !== 1 ? 's' : ''}
              {totalSeconds > 0 && (
                <span className="ml-2 font-normal text-ink-4">· {fmtDuration(totalSeconds)} total</span>
              )}
            </p>
            <ul className="space-y-1.5">
              {selectedVideos.slice(0, 5).map((v) => (
                <li key={v.id} className="flex items-center gap-2 text-body-sm text-ink-3 min-w-0">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-ink-4" aria-hidden="true" />
                  <span className="truncate">{v.title ?? 'Untitled'}</span>
                  {v.durationSeconds != null && (
                    <span className="ml-auto shrink-0 font-mono text-caption text-ink-5">
                      {fmtDuration(v.durationSeconds)}
                    </span>
                  )}
                </li>
              ))}
              {selectedVideos.length > 5 && (
                <li className="text-body-sm text-ink-4 pl-3">
                  + {selectedVideos.length - 5} more
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Source required error */}
        {showSourceRequiredError && (
          <div className="mb-8 rounded-xl border border-amber/40 bg-amber-wash px-5 py-4" role="alert">
            <p className="text-body-sm font-semibold text-amber-ink">Source confirmation required</p>
            <p className="mt-1.5 text-body-sm text-amber-ink/80 leading-relaxed">
              These videos do not have confirmed transcript support yet. Choose captioned videos,
              check transcript support, or explicitly confirm that you want to continue with a
              limited-source hub.
            </p>
          </div>
        )}

        {/* Source coverage */}
        <div className={`mb-8 overflow-hidden rounded-xl border ${coverageCopy.wrapperClass}`}>
          <div className="px-5 py-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${coverageCopy.dotClass}`} aria-hidden="true" />
                  <p className={`text-body-sm font-semibold ${coverageCopy.textClass}`}>{coverageCopy.title}</p>
                </div>
                <p className={`mt-2 max-w-[520px] text-body-sm leading-relaxed ${coverageCopy.bodyClass}`}>
                  {coverageCopy.body}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full border border-rule bg-paper/70 px-2.5 py-1 text-caption text-ink-3">
                    {sourceCoverage.readyCount} ready
                  </span>
                  <span className="rounded-full border border-rule bg-paper/70 px-2.5 py-1 text-caption text-ink-3">
                    {sourceCoverage.transcribableCount} needs transcription
                  </span>
                  <span className="rounded-full border border-rule bg-paper/70 px-2.5 py-1 text-caption text-ink-3">
                    {sourceCoverage.unknownCount} unchecked
                  </span>
                  <span className="rounded-full border border-rule bg-paper/70 px-2.5 py-1 text-caption text-ink-3">
                    {sourceCoverage.unavailableCount} limited
                  </span>
                </div>
              </div>
              {hasUnknownVideos && (
                <form action={checkSourceCoverage} className="shrink-0">
                  <input type="hidden" name="video_ids" value={videoIds.join(',')} />
                  <button
                    type="submit"
                    className="inline-flex h-9 whitespace-nowrap items-center rounded-lg border border-rule bg-paper px-4 text-body-sm font-medium text-ink transition hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                  >
                    Check transcript support
                  </button>
                </form>
              )}
            </div>
            {sourceCoverage.videos.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {sourceCoverage.videos.slice(0, 5).map((row) => {
                  const rl = readinessLabel(row.readinessLabel);
                  return (
                    <div key={row.videoId} className="flex items-center justify-between gap-3 rounded-lg bg-paper/70 px-3 py-2">
                      <span className="truncate text-body-sm text-ink">{row.title ?? 'Untitled'}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-caption font-medium ${rl.className}`}>
                        {rl.text}
                      </span>
                    </div>
                  );
                })}
                {sourceCoverage.videos.length > 5 && (
                  <p className={`text-caption ${coverageCopy.bodyClass}`}>
                    + {sourceCoverage.videos.length - 5} more selected videos
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Config form */}
        <form action={createProject} className="space-y-8">
          <input type="hidden" name="video_ids" value={videoIds.join(',')} />

          {/* Title */}
          <div className="space-y-2">
            <label className="block text-body-sm font-semibold text-ink" htmlFor="title">
              Hub title
              <span className="ml-1.5 font-normal text-rose" aria-label="required">*</span>
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              placeholder="e.g. The KeyBooks Productivity System"
              className="h-10 w-full rounded-lg border border-rule bg-paper px-3 text-body-md text-ink placeholder:text-ink-4 transition focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
            />
          </div>

          {/* Audience */}
          <div className="space-y-2">
            <label className="block text-body-sm font-semibold text-ink" htmlFor="audience">
              Target audience
              <span className="ml-1.5 font-normal text-ink-4">(optional)</span>
            </label>
            <input
              id="audience"
              name="audience"
              type="text"
              placeholder="e.g. Busy professionals who want to read more"
              className="h-10 w-full rounded-lg border border-rule bg-paper px-3 text-body-md text-ink placeholder:text-ink-4 transition focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
            />
          </div>

          {/* Tone — segmented control */}
          <div className="space-y-2">
            <p className="text-body-sm font-semibold text-ink" id="tone-label">Tone</p>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="tone-label">
              {(['conversational', 'professional', 'academic'] as const).map((t) => (
                <label
                  key={t}
                  className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-rule bg-paper px-3 py-2.5 text-body-sm text-ink-3 transition hover:bg-paper-2 has-[:checked]:border-amber has-[:checked]:bg-amber/8 has-[:checked]:text-ink has-[:checked]:font-medium"
                >
                  <input type="radio" name="tone" value={t} defaultChecked={t === 'conversational'} className="sr-only" />
                  <span className="capitalize">{t}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Hub depth — segmented control */}
          <div className="space-y-2">
            <p className="text-body-sm font-semibold text-ink" id="depth-label">Hub depth</p>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="depth-label">
              {([
                { key: 'short', label: 'Concise', desc: 'Key ideas only' },
                { key: 'standard', label: 'Standard', desc: 'Balanced depth' },
                { key: 'deep', label: 'Deep', desc: 'Full coverage' },
              ] as const).map(({ key, label, desc }) => (
                <label
                  key={key}
                  className="flex flex-1 cursor-pointer flex-col rounded-lg border border-rule bg-paper px-3 py-3 transition hover:bg-paper-2 has-[:checked]:border-amber has-[:checked]:bg-amber/8"
                >
                  <input type="radio" name="length_preset" value={key} defaultChecked={key === 'standard'} className="sr-only" />
                  <span className="text-body-sm font-semibold text-ink">{label}</span>
                  <span className="mt-0.5 text-caption text-ink-4">{desc}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Hub template */}
          <div className="space-y-2">
            <p className="text-body-sm font-semibold text-ink" id="template-label">Hub template</p>
            <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-labelledby="template-label">
              {HUB_TEMPLATE_OPTIONS.map((template) => (
                <label
                  key={template.id}
                  className={`flex min-h-[160px] cursor-pointer flex-col rounded-xl border p-4 transition ${template.configureClassName}`}
                >
                  <input
                    type="radio"
                    name="presentation_preset"
                    value={template.id}
                    defaultChecked={template.id === 'paper'}
                    className="sr-only"
                  />
                  <span className="text-eyebrow uppercase tracking-widest opacity-70">
                    {template.previewLabel}
                  </span>
                  <span className="mt-3 text-body-md font-semibold">{template.name}</span>
                  <span className="mt-2 text-body-sm leading-relaxed opacity-75">{template.tagline}</span>
                </label>
              ))}
            </div>
            <p className="text-caption text-ink-4 leading-relaxed">
              Controls the public hub layout after publishing. Content stays identical while the reader experience changes.
            </p>
          </div>

          {/* Chat toggle */}
          <div className="flex items-center justify-between rounded-xl border border-rule bg-paper px-5 py-4">
            <div>
              <p className="text-body-sm font-semibold text-ink">Enable chat</p>
              <p className="mt-0.5 text-body-sm text-ink-4">Viewers can ask questions about your content</p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center" aria-label="Toggle chat">
              <input type="checkbox" name="chat_enabled" value="true" defaultChecked className="sr-only peer" />
              <div className="h-5 w-9 rounded-full bg-rule transition-colors peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-amber peer-focus-visible:ring-offset-2" />
              <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
            </label>
          </div>

          {/* Price + submit */}
          <div className="overflow-hidden rounded-xl border border-rule-dark bg-paper">
            <div className="border-b border-rule bg-paper-2 px-5 py-3">
              <p className="text-eyebrow uppercase tracking-widest text-ink-4">Order summary</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-ink-3">Hub generation</span>
                <span className="font-semibold text-ink">{price}</span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-ink-3">Videos included</span>
                <span className="text-ink">
                  {selectedVideos.length} video{selectedVideos.length !== 1 ? 's' : ''}
                  {totalSeconds > 0 && (
                    <span className="ml-1.5 text-ink-4">· {fmtDuration(totalSeconds)}</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-ink-3">Delivery</span>
                <span className="text-ink">Draft ready in ~4 minutes</span>
              </div>

              {requiresLimitedSourceConfirmation && (
                <div className="rounded-lg border border-amber/30 bg-amber-wash px-4 py-3">
                  <label className="flex items-start gap-3 cursor-pointer text-body-sm text-ink-3">
                    <input
                      type="checkbox"
                      name="allow_limited_source"
                      value="true"
                      required
                      className="mt-0.5 h-4 w-4 rounded border-rule text-ink accent-ink focus:ring-amber"
                    />
                    <span className="leading-relaxed">
                      I understand this hub may publish with limited source support because no
                      selected videos have confirmed captions.
                    </span>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-between gap-4 border-t border-rule pt-4">
                {requiresLimitedSourceConfirmation ? (
                  <Link href="/app/library" className="text-body-sm text-ink-4 underline hover:text-ink">
                    Choose videos with captions
                  </Link>
                ) : (
                  <div className="flex items-center gap-1.5 text-caption text-ink-4">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm0 2.5v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    Payment processed securely via Stripe
                  </div>
                )}
                <button
                  type="submit"
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-ink px-6 text-body-sm font-semibold text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                >
                  {requiresLimitedSourceConfirmation ? 'Continue with limited-source hub' : 'Continue to payment'}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
