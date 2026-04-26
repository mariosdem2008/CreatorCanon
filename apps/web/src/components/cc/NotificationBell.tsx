import Link from 'next/link';

export function NotificationBell({ unreadCount = 0 }: { unreadCount?: number }) {
  const hasUnread = unreadCount > 0;
  return (
    <Link
      href="/app/inbox"
      aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      className="relative grid place-items-center size-[30px] rounded-[8px] border border-[var(--cc-rule)] bg-white text-[var(--cc-ink)] transition hover:border-[var(--cc-ink-4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)]"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden
      >
        <path d="M3.5 11h9l-1-1.5V7a3.5 3.5 0 0 0-7 0v2.5L3.5 11Z" />
        <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
      </svg>
      {hasUnread ? (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[var(--cc-danger)] ring-2 ring-white"
        />
      ) : null}
    </Link>
  );
}
