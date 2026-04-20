import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { estimateRunPriceCents, formatUsdCents } from '@creatorcanon/core';
import { eq, getDb, inArray } from '@creatorcanon/db';
import { video, workspaceMember } from '@creatorcanon/db/schema';

import { createProject } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Configure Hub' };

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams?: { ids?: string };
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
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-6 text-body-sm font-medium text-paper transition hover:opacity-90"
            >
              ✦ Continue to payment
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
