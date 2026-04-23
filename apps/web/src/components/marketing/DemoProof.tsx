import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

interface DemoHubCard {
  title: string;
  description: string;
  label: string;
  href: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const DEMO_HUBS: DemoHubCard[] = [
  {
    title: 'LLM End-to-End Proof Hub',
    description:
      'Audio-transcribed lecture archive turned into a structured reference hub. Every concept cites the source video moment.',
    label: 'Editorial Atlas template',
    href: 'https://creatorcanon-saas.vercel.app/h/llm-end-to-end-proof-hub/overview',
    accentColor: '#b08a3e',
    bgColor: '#fdf8f0',
    textColor: '#1a1612',
    borderColor: '#ddd0b4',
  },
  {
    title: 'Hosted Webhook Proof Hub',
    description:
      'Technical teaching archive structured as a browsable knowledge hub with chapter-level citations and framework tracks.',
    label: 'Playbook OS template',
    href: 'https://creatorcanon-saas.vercel.app/h/hosted-webhook-proof-hub/overview',
    accentColor: '#c8ef60',
    bgColor: '#070b10',
    textColor: '#eef5ef',
    borderColor: '#263240',
  },
];

export function DemoProof() {
  return (
    <section
      id="demo"
      aria-labelledby="demo-heading"
      className="border-b border-rule bg-paper-2"
    >
      <div className="mx-auto max-w-[1140px] px-6 py-20">
        <div className="text-eyebrow uppercase text-ink-4">Live demos</div>
        <h2
          id="demo-heading"
          className="mt-3 max-w-[640px] font-serif text-display-md text-ink tracking-[-0.025em]"
        >
          See what a finished hub looks like.
        </h2>
        <p className="mt-4 max-w-[60ch] text-body-lg text-ink-2 leading-[1.7]">
          These are real hubs built from transcribed video archives. Browse the structure,
          read a lesson, and follow a citation back to its source moment.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {DEMO_HUBS.map((hub) => (
            <figure
              key={hub.href}
              className="group overflow-hidden rounded-lg border"
              style={{ borderColor: hub.borderColor, backgroundColor: hub.bgColor }}
            >
              {/* Simulated hub chrome bar */}
              <div
                className="flex items-center gap-2 border-b px-5 py-3"
                style={{ borderColor: hub.borderColor }}
                aria-hidden
              >
                <span
                  className="h-2 w-2 rounded-full opacity-50"
                  style={{ backgroundColor: hub.accentColor }}
                />
                <span
                  className="font-mono text-[11px] opacity-40"
                  style={{ color: hub.textColor }}
                >
                  creatorcanon-saas.vercel.app
                </span>
              </div>

              {/* Hub content preview */}
              <div className="px-6 py-8">
                <div
                  className="mb-2 font-mono text-[10px] uppercase tracking-widest opacity-50"
                  style={{ color: hub.accentColor }}
                >
                  {hub.label}
                </div>
                <figcaption
                  className="font-serif text-[1.35rem] leading-snug tracking-[-0.02em]"
                  style={{ color: hub.textColor }}
                >
                  {hub.title}
                </figcaption>
                <p
                  className="mt-3 text-[0.9rem] leading-relaxed opacity-70"
                  style={{ color: hub.textColor }}
                >
                  {hub.description}
                </p>

                <Link
                  href={hub.href}
                  className="mt-6 inline-flex items-center gap-2 rounded text-[0.85rem] font-medium underline-offset-4 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ color: hub.accentColor }}
                  aria-label={`Open ${hub.title} demo hub`}
                >
                  Browse this hub
                  <Icon name="arrowRight" size={13} />
                </Link>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
