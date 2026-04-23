export function ProblemSection() {
  return (
    <section
      id="the-problem"
      aria-labelledby="problem-heading"
      className="border-b border-rule bg-paper-warm"
    >
      <div className="mx-auto max-w-[1140px] px-6 py-20">
        <div className="max-w-[720px]">
          <div className="text-eyebrow uppercase text-ink-4">The problem</div>
          <h2
            id="problem-heading"
            className="mt-3 font-serif text-display-md text-ink tracking-[-0.025em]"
          >
            A YouTube archive is not a knowledge product.
          </h2>
          <div className="mt-6 space-y-4 text-body-lg text-ink-2 leading-[1.7]">
            <p>
              A creator with five years of YouTube content has thousands of hours of genuine
              expertise on record. But that expertise is locked inside chronological uploads —
              searchable only by title, navigable only by date, and impossible to share as a
              coherent body of work.
            </p>
            <p>
              Ideas repeat across dozens of videos. Frameworks get refined episode by episode but
              never collected. Readers who want the whole picture have to watch everything in
              order, take their own notes, and hope they find the right video at the right moment.
              The archive grows, but the knowledge stays buried.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
