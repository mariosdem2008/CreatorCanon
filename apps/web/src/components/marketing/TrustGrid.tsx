import { Icon, type IconName } from '@creatorcanon/ui';

interface TrustItem {
  icon: IconName;
  title: string;
  body: string;
}

const ITEMS: TrustItem[] = [
  {
    icon: 'lock',
    title: 'Read-only YouTube access',
    body: 'CreatorCanon never edits your channel. Connect once, revoke any time.',
  },
  {
    icon: 'quote',
    title: 'Citations are first-class',
    body: 'Every section ships with timestamped source moments members can audit themselves.',
  },
  {
    icon: 'check2',
    title: 'You approve every page',
    body: 'No auto-publish. Drafts go through review with section-level edit and approve.',
  },
  {
    icon: 'globe',
    title: 'You own the URL',
    body: 'Hubs are hosted under a subdomain you control. Custom domains post-alpha.',
  },
];

export function TrustGrid() {
  return (
    <section className="border-b border-rule bg-paper-warm">
      <div className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-16">
          <div>
            <div className="text-eyebrow uppercase text-ink-4">The trust layer</div>
            <h2 className="mt-3 font-serif text-display-md text-ink">
              Built so members can trust the hub more than a generic AI summary.
            </h2>
            <p className="mt-5 text-body-md text-ink-3">
              CreatorCanon is source-grounded by design. If a paragraph isn&apos;t supported by
              your own footage, it gets a &ldquo;limited support&rdquo; flag instead of being
              fabricated into something polished-but-wrong.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-2">
            {ITEMS.map((item) => (
              <div key={item.title} className="bg-paper p-6">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-paper-2 text-ink"
                  aria-hidden
                >
                  <Icon name={item.icon} size={14} />
                </span>
                <div className="mt-4 text-heading-md text-ink">{item.title}</div>
                <p className="mt-2 text-body-sm text-ink-3">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
