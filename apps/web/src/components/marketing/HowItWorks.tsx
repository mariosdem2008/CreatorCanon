import { Icon, type IconName } from '@creatorcanon/ui';

interface Step {
  n: string;
  icon: IconName;
  title: string;
  body: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    n: '01',
    icon: 'youtube',
    title: 'Connect your channel',
    body: 'Read-only access to your own videos and captions. Nothing public is touched.',
    detail: 'YouTube readonly · OAuth · revocable',
  },
  {
    n: '02',
    icon: 'check2',
    title: 'Pick a focused source set',
    body: 'Start narrow — 8 to 20 videos that already explain a single thing well.',
    detail: 'Caption-ready filter · transcript score',
  },
  {
    n: '03',
    icon: 'sparkle',
    title: 'Atlas plans the structure',
    body: 'Tracks, lessons, support labels, and source citations are proposed for review.',
    detail: 'Source-grounded · cited every section',
  },
  {
    n: '04',
    icon: 'upload',
    title: 'Approve and publish',
    body: 'You edit, approve, then ship a public hub at a URL you own.',
    detail: 'No surprises · diff per page · revertable',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-rule bg-paper" aria-label="How CreatorCanon works">
      <div className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="grid gap-10 md:grid-cols-[minmax(0,460px)_minmax(0,1fr)] md:items-end">
          <div>
            <div className="text-eyebrow uppercase text-ink-4">How it works</div>
            <h2 className="mt-3 font-serif text-display-md text-ink">
              An agent builds it. You stay in control.
            </h2>
          </div>
          <p className="text-body-lg text-ink-2 md:text-right">
            Connect, pick the source set, review the plan, ship a hub. Every section carries the
            quote and timestamp it came from — so you can edit, accept, or reject with full
            context.
          </p>
        </div>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} className="flex flex-col gap-4 bg-paper p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-caption text-amber-ink">{step.n}</span>
                <Icon name={step.icon} size={18} className="text-ink-3" />
              </div>
              <div className="text-heading-md text-ink">{step.title}</div>
              <div className="text-body-sm text-ink-3">{step.body}</div>
              <div className="mt-auto pt-3 border-t border-rule text-caption font-mono text-ink-4">
                {step.detail}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
