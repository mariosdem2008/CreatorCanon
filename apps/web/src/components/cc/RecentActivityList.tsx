import Link from 'next/link';

import { Panel, PanelHeader } from './Panel';
import { StatusPill } from './StatusPill';

export type RecentActivityItem = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  createdAt: Date;
  status: string;
};

export function RecentActivityList({ items }: { items: RecentActivityItem[] }) {
  return (
    <Panel>
      <PanelHeader
        title="Recent activity"
        meta={
          items.length > 0 ? (
            <Link href="/app/inbox" className="hover:text-[var(--cc-ink)]">
              View all
            </Link>
          ) : null
        }
      />
      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <span
            aria-hidden
            className="mx-auto mb-2.5 grid size-9 place-items-center rounded-[8px] bg-[var(--cc-surface-2)] text-[16px]"
          >
            ◇
          </span>
          <p className="text-[13px] font-semibold text-[var(--cc-ink)]">No activity yet</p>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[12px] leading-[1.5] text-[var(--cc-ink-4)]">
            Select videos to start your first hub. Atlas will log every step here.
          </p>
          <Link
            href="/app/library"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
          >
            Select videos →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--cc-rule)]">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <StatusPill tone={pillToneFor(item.status, item.kind)} withDot>
                    {item.kind.replaceAll('_', ' ')}
                  </StatusPill>
                  <span className="text-[11px] text-[var(--cc-ink-4)]">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] font-semibold text-[var(--cc-ink)]">
                  {item.title}
                </p>
                {item.body ? (
                  <p className="mt-1 text-[12px] leading-[1.5] text-[var(--cc-ink-3)] line-clamp-2">
                    {item.body}
                  </p>
                ) : null}
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="shrink-0 text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
                >
                  Open →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function pillToneFor(status: string, kind: string): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (status === 'unread') {
    if (kind === 'run_failed') return 'danger';
    if (kind === 'run_awaiting_review') return 'warn';
    return 'info';
  }
  if (kind === 'release_published') return 'success';
  return 'neutral';
}

function formatTime(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}
