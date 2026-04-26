import { Icon, type IconName } from '@creatorcanon/ui';

interface Feature {
  n: string;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    n: '01',
    title: 'Repeated advice becomes named frameworks',
    body: 'Atlas extracts the recurring teaching shapes you already use, then turns them into operator-grade lessons, tracks, and support labels.',
  },
  {
    n: '02',
    title: 'Every claim is linked to the moment it came from',
    body: 'Sections carry support labels, timestamps, and quoted source moments — so members see the receipts, not a black-box summary.',
  },
  {
    n: '03',
    title: 'AI output is publishable, not pasted',
    body: 'You review every page, edit any section, and approve before publish. Drafts are a side conversation; the public hub is yours.',
  },
];

interface MemberCard {
  title: string;
  body: string;
  icon: IconName;
}

const MEMBER_CARDS: MemberCard[] = [
  {
    icon: 'tree',
    title: 'Framework tracks',
    body: 'Named systems members can start from instead of hunting through your uploads.',
  },
  {
    icon: 'layers',
    title: 'Playbooks',
    body: 'Decision guides and weekly operating routines tied directly to the lessons.',
  },
  {
    icon: 'file',
    title: 'Templates',
    body: 'Member-only checklists and scorecards worth saving and reusing.',
  },
  {
    icon: 'chat',
    title: 'Grounded chat',
    body: 'Answers that cite the lesson and source moment instead of improvising.',
  },
];

export function Features() {
  return (
    <section className="border-b border-rule bg-paper-2">
      <div className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="text-eyebrow uppercase text-ink-4">What changes</div>
        <h2 className="mt-3 max-w-[760px] font-serif text-display-md text-ink">
          From scattered teaching videos to a sellable, trustworthy learning product.
        </h2>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.n} className="border-t border-rule-strong pt-6">
              <div className="font-mono text-caption text-amber-ink">{f.n}</div>
              <h3 className="mt-3 text-heading-lg text-ink">{f.title}</h3>
              <p className="mt-2 text-body-md text-ink-3">{f.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-eyebrow uppercase text-ink-4">What members actually buy</div>
              <h3 className="mt-3 max-w-[820px] font-serif text-display-md text-ink">
                Not just polished reading. A more useful product than your YouTube archive.
              </h3>
            </div>
            <span className="font-mono text-caption text-ink-4">
              Members · readers · ops teams
            </span>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {MEMBER_CARDS.map((card) => (
              <div
                key={card.title}
                className="group rounded-lg border border-rule bg-paper p-6 shadow-1 transition hover:-translate-y-px hover:shadow-2"
              >
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-amber-wash text-amber-ink"
                  aria-hidden
                >
                  <Icon name={card.icon} size={16} />
                </span>
                <div className="mt-4 text-heading-md text-ink">{card.title}</div>
                <div className="mt-2 text-body-sm text-ink-3">{card.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
