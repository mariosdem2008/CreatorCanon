interface Feature {
  n: string;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    n: '01',
    title: 'Repeated advice becomes named frameworks',
    body: 'Atlas turns recurring teaching patterns into clear lessons, tracks, and operator notes.',
  },
  {
    n: '02',
    title: 'Business content becomes easier to use',
    body: 'Readers can browse by framework, search specific tactics, and find the exact lesson they need fast.',
  },
  {
    n: '03',
    title: 'AI output becomes publishable',
    body: 'Sections carry support labels, source moments, and grounded answers instead of opaque summarization.',
  },
];

export function Features() {
  return (
    <section className="border-b border-rule bg-paper-2">
      <div className="mx-auto max-w-[1140px] px-6 py-24">
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
          <div className="text-eyebrow uppercase text-ink-4">What members actually buy</div>
          <h3 className="mt-3 max-w-[820px] font-serif text-display-md text-ink">
            Not just polished reading. A more useful business product than a YouTube archive.
          </h3>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: 'Framework tracks',
                body: 'Named systems readers can start from instead of hunting through uploads.',
              },
              {
                title: 'Playbooks',
                body: 'Decision guides and weekly operating routines tied to the lessons.',
              },
              {
                title: 'Templates',
                body: 'Member-only checklists and scorecards worth saving and reusing.',
              },
              {
                title: 'Grounded chat',
                body: 'Answers that cite the lesson and source moment instead of improvising.',
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-lg border border-rule bg-paper p-6 shadow-1"
              >
                <div className="text-heading-md text-ink">{card.title}</div>
                <div className="mt-2 text-body-sm text-ink-3">{card.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
