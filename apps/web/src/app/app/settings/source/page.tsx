import Link from 'next/link';

import { and, count, eq, inArray } from '@creatorcanon/db';
import { channel, video, youtubeConnection } from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

import { SettingsNote, SettingsPanel, SettingsRow } from '../panels';
import { disconnectYouTube, requestSourceResync } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — Source' };

export default async function SettingsSourcePage() {
  const { db, workspaceId, role } = await requireWorkspace();

  const [channels, connections] = await Promise.all([
    db.select().from(channel).where(eq(channel.workspaceId, workspaceId)).limit(1),
    db
      .select()
      .from(youtubeConnection)
      .where(eq(youtubeConnection.workspaceId, workspaceId))
      .limit(1),
  ]);

  const ch = channels[0];
  const conn = connections[0];

  const [videoTotalRow, captionReadyRow] = ch
    ? await Promise.all([
        db.select({ n: count() }).from(video).where(eq(video.channelId, ch.id)),
        db
          .select({ n: count() })
          .from(video)
          .where(
            and(
              eq(video.channelId, ch.id),
              inArray(video.captionStatus, ['available', 'auto_only']),
            ),
          ),
      ])
    : [[{ n: 0 }], [{ n: 0 }]];

  const videoTotal = videoTotalRow[0]?.n ?? 0;
  const captionReady = captionReadyRow[0]?.n ?? 0;

  return (
    <>
      <SettingsPanel
        title="YouTube connection"
        description="Read-only OAuth grant for the channel you want to productize."
        meta={conn ? `Status: ${conn.status}` : 'Not connected'}
      >
        <SettingsRow
          label="Connected channel"
          value={ch?.title ?? 'Not connected'}
          hint={ch?.handle ?? undefined}
        />
        <SettingsRow
          label="YouTube channel ID"
          value={ch?.youtubeChannelId ?? '—'}
          mono={Boolean(ch?.youtubeChannelId)}
        />
        <SettingsRow
          label="Videos discovered"
          value={String(videoTotal)}
          hint={`${captionReady} caption-ready (auto or human-supplied)`}
        />
        <SettingsRow
          label="Last synced"
          value={conn?.lastSyncedAt ? formatDateTime(conn.lastSyncedAt) : 'Never'}
        />
        <SettingsRow
          label="Granted scopes"
          value={(conn?.scopes ?? []).join(', ') || 'None'}
          mono={(conn?.scopes ?? []).length > 0}
        />
        {!ch ? (
          <SettingsNote tone="warning">
            No channel is connected yet. Visit the{' '}
            <Link
              href="/app"
              className="font-semibold underline underline-offset-2 hover:opacity-80"
            >
              command center
            </Link>{' '}
            to start the OAuth flow.
          </SettingsNote>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 px-5 py-3.5">
            <form action={requestSourceResync}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] transition hover:border-[var(--cc-ink-4)]"
              >
                Request resync
              </button>
            </form>
            {role === 'owner' && conn?.status === 'connected' ? (
              <form action={disconnectYouTube}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-danger)]/40 bg-[var(--cc-danger-wash)] px-3 text-[12px] font-semibold text-[var(--cc-danger)] transition hover:opacity-80"
                >
                  Disconnect YouTube
                </button>
              </form>
            ) : null}
            <p className="ml-auto text-[11px] text-[var(--cc-ink-4)] max-w-[440px]">
              Resync schedules a fresh worker pass. Disconnect marks the OAuth grant revoked
              locally; Google&apos;s token is invalidated when the worker picks up the change.
            </p>
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Sync hygiene"
        description="What CreatorCanon imports and how often."
      >
        <SettingsRow
          label="Caption coverage"
          value={`${captionReady}/${videoTotal}`}
          hint="Only caption-ready videos can be promoted into a hub."
        />
        <SettingsRow
          label="Resync cadence"
          value="Manual (alpha)"
          hint="Background resync lands with the worker scheduler."
        />
        <SettingsRow
          label="Token rotation"
          value="Auto via Google refresh"
        />
      </SettingsPanel>
    </>
  );
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}
