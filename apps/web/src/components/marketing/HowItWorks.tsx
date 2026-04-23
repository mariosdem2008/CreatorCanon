import { Icon, type IconName } from '@creatorcanon/ui';

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
    body: 'Read-only access. CreatorCanon pulls captions and metadata — no editing permissions on your channel.',
  },
  {
    n: '02',
    icon: 'check2',
    title: 'Choose your strongest videos',
    body: 'Pick 20–50 teaching videos to start. You are curating, not dumping — quality of selection shapes quality of the hub.',
  },
  {
    n: '03',
    icon: 'layers',
    title: 'Review the proposed structure',
    body: 'CreatorCanon groups recurring ideas into named frameworks, lesson tracks, and chapter headings for your approval.',
  },
  {
    n: '04',
    icon: 'globe',
    title: 'Publish your hub',
    body: 'A hosted website with citation-backed lessons. Every claim links to the video moment it came from.',
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="border-b border-rule bg-paper"
    >
      <div className="mx-auto max-w-[1140px] px-6 py-20">
        <div className="max-w-[640px]">
          <div className="text-eyebrow uppercase text-ink-4">How it works</div>
          <h2
            id="how-it-works-heading"
            className="mt-3 font-serif text-display-md text-ink tracking-[-0.025em]"
          >
            From archive to published hub in four steps.
          </h2>
          <p className="mt-5 text-body-lg text-ink-2 leading-[1.7]">
            You select the source. CreatorCanon handles the structure, prose, and citations.
            You review and refine before anything goes live.
          </p>
        </div>

        <ol
          className="mt-14 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-4"
          aria-label="Process steps"
        >
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="flex flex-col gap-4 bg-paper p-7"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-caption text-amber-ink">{step.n}</span>
                <Icon name={step.icon} size={18} className="text-ink-3" aria-hidden />
              </div>
              <div className="text-heading-md text-ink">{step.title}</div>
              <div className="text-body-sm text-ink-3 leading-[1.65]">{step.body}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
