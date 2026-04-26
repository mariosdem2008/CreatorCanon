import Image from 'next/image';
import Link from 'next/link';

import { Panel, PanelHeader } from './Panel';
import { StatusPill } from './StatusPill';

export type ChannelHeaderProps = {
  avatarUrl?: string | null;
  name: string;
  handle?: string | null;
  videoCount?: number;
  subscriberCount?: number;
  captionReadyCount?: number;
  isConnected: boolean;
  /** Optional override for the right-side CTA. Defaults to "View videos" linking to /app/library. */
  cta?: { label: string; href: string } | null;
};

function fmtNumber(n: number | undefined): string {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function ChannelHeaderCard({
  channel,
}: {
  channel: ChannelHeaderProps;
}) {
  if (!channel.isConnected) {
    return (
      <Panel>
        <PanelHeader title="Your YouTube channel" meta="Not connected" />
        <div className="px-4 py-6 text-center">
          <p className="text-[13px] font-semibold text-[var(--cc-ink)]">No channel connected</p>
          <p className="mx-auto mt-2 max-w-[280px] text-[12px] leading-[1.5] text-[var(--cc-ink-4)]">
            Connect a YouTube channel to start building your first knowledge hub.
          </p>
          <Link
            href="/app#connect"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
          >
            Connect channel →
          </Link>
        </div>
      </Panel>
    );
  }

  const captionPct =
    channel.videoCount && channel.captionReadyCount != null
      ? Math.round((channel.captionReadyCount / channel.videoCount) * 100)
      : null;

  return (
    <Panel>
      <PanelHeader title="Your YouTube channel" meta={<StatusPill tone="success">Connected</StatusPill>} />
      <div className="flex items-center gap-3.5 px-4 py-4">
        {channel.avatarUrl ? (
          <Image
            src={channel.avatarUrl}
            alt=""
            width={56}
            height={56}
            className="size-14 rounded-[12px] object-cover shrink-0"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-14 place-items-center rounded-[12px] bg-gradient-to-br from-[#ef4444] to-[#b91c1c] text-white text-[20px] font-bold shrink-0"
          >
            {channel.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--cc-ink)]">{channel.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--cc-ink-3)]">
            {channel.handle ?? 'YouTube'}
          </p>
          <p className="mt-2 text-[12px] text-[var(--cc-ink-3)]">
            <span className="font-semibold text-[var(--cc-ink)]">
              {fmtNumber(channel.videoCount)}
            </span>{' '}
            videos
            {channel.subscriberCount != null ? (
              <>
                {' '}·{' '}
                <span className="font-semibold text-[var(--cc-ink)]">
                  {fmtNumber(channel.subscriberCount)}
                </span>{' '}
                subs
              </>
            ) : null}
            {captionPct != null ? (
              <>
                {' '}·{' '}
                <span className="font-semibold text-[var(--cc-ink)]">{captionPct}%</span>{' '}
                captions
              </>
            ) : null}
          </p>
        </div>
        {channel.cta === null ? null : (
          <Link
            href={channel.cta?.href ?? '/app/library'}
            className="shrink-0 rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--cc-accent)] hover:border-[var(--cc-accent)]"
          >
            {channel.cta?.label ?? 'View videos'}
          </Link>
        )}
      </div>
    </Panel>
  );
}
