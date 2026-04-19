import { Icon, type IconName } from '@atlas/ui';

interface Step {
  n: string;
  icon: IconName;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    n: '01',
    icon: 'youtube',
    title: 'Connect your channel',
    body: 'Read-only access for your own videos and captions.',
  },
  {
    n: '02',
    icon: 'check2',
    title: 'Select the best teaching videos',
    body: 'Start with one focused source set instead of your whole archive.',
  },
  {
    n: '03',
    icon: 'sparkle',
    title: 'Review the framework structure',
    body: 'Atlas proposes tracks, lessons, support labels, and playbooks.',
  },
  {
    n: '04',
    icon: 'upload',
    title: 'Publish a premium business hub',
    body: 'Launch with preview controls, citations, and grounded member chat.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-rule bg-paper">
      <div className="mx-auto max-w-[1140px] px-6 py-24">
        <div className="max-w-[760px]">
          <div className="text-eyebrow uppercase text-ink-4">How it works</div>
          <h2 className="mt-3 font-serif text-display-md text-ink">
            Select the source archive. Atlas builds the operating manual.
          </h2>
          <p className="mt-5 text-body-lg text-ink-2">
            Connect your channel, choose the strongest teaching videos, and let Atlas turn
            recurring ideas into structured frameworks, tactical lessons, playbooks, citations,
            and grounded chat your audience can actually use.
          </p>
        </div>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex flex-col gap-4 bg-paper p-7"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-caption text-amber-ink">{step.n}</span>
                <Icon name={step.icon} size={18} className="text-ink-3" />
              </div>
              <div className="text-heading-md text-ink">{step.title}</div>
              <div className="text-body-sm text-ink-3">{step.body}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
