const CRITERIA = [
  'You have two or more years of YouTube teaching on record — tutorials, lessons, frameworks, or analysis.',
  'Your content repeats core ideas across many videos rather than chasing trending topics.',
  'You want a destination your audience can study, not just a feed they scroll past.',
  'You would rather own a structured knowledge product than hand your archive to a third-party AI tool.',
  'You are comfortable being in alpha: you will give real feedback and work with us on the first version.',
];

export function WhoItsFor() {
  return (
    <section
      id="who-its-for"
      aria-labelledby="who-heading"
      className="border-b border-rule bg-paper-warm"
    >
      <div className="mx-auto max-w-[1140px] px-6 py-20">
        <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
          <div>
            <div className="text-eyebrow uppercase text-ink-4">Built for</div>
            <h2
              id="who-heading"
              className="mt-3 font-serif text-display-md text-ink tracking-[-0.025em]"
            >
              Creators with an archive worth structuring.
            </h2>
            <p className="mt-5 text-body-lg text-ink-2 leading-[1.7]">
              CreatorCanon is for solopreneur YouTubers in the 2-to-10-year range — people
              whose back-catalogue represents genuine expertise, not just volume.
            </p>
          </div>

          <ul className="space-y-4 pt-1" role="list">
            {CRITERIA.map((item) => (
              <li key={item} className="flex gap-3 text-body-md text-ink-2 leading-[1.65]">
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-ink"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
