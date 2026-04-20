import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon, type IconName } from '@creatorcanon/ui';

import { FAQItem } from '@/components/marketing/FAQItem';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Quickstart guides, frequently asked questions, and how to reach the CreatorCanon team.',
};

interface QuickCard {
  icon: IconName;
  title: string;
  body: string;
  href: string;
}

const QUICKSTART: QuickCard[] = [
  {
    icon: 'book',
    title: 'Quickstart guide',
    body: 'From YouTube connect to published hub in under ten minutes.',
    href: '/help',
  },
  {
    icon: 'sparkle',
    title: 'Writing great topics',
    body: 'How to cluster videos into arcs your readers will want to follow.',
    href: '/help',
  },
  {
    icon: 'chat',
    title: 'Tuning Iris',
    body: 'Give your grounded chat a personality that sounds like your material, without first-person impersonation.',
    href: '/help',
  },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How long does a topic take to generate?',
    a: 'Usually 3–6 minutes for an 8-lesson topic. Longer topics or chat-enabled topics take up to 12 minutes.',
  },
  {
    q: 'Can I edit everything CreatorCanon writes?',
    a: "Yes. Every word. You can also regenerate any single section, or the whole topic, as many times as you want — it's all free after the first generation charge.",
  },
  {
    q: 'Who owns the generated content?',
    a: 'You do. CreatorCanon is a service that helps you draft — we claim no rights to your lessons, your chat answers, or your subscriber list.',
  },
  {
    q: 'What happens if YouTube removes a video?',
    a: "Your hub stays up. CreatorCanon caches the transcript once it's generated, so your lessons survive even if a video is unlisted or deleted.",
  },
  {
    q: 'How do I move off CreatorCanon?',
    a: 'Settings › Advanced › Export. You get clean markdown + JSON. Most creators host their export on Ghost or a static site.',
  },
];

export default function HelpPage() {
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[1140px] px-6 py-20">
        <div className="max-w-[720px]">
          <div className="text-eyebrow uppercase text-ink-4">Help</div>
          <h1 className="mt-3 font-serif text-display-lg text-ink">
            Help and documentation.
          </h1>
          <p className="mt-5 text-body-lg text-ink-3">
            Start with one of the quickstart guides below, browse the frequently-asked list, or
            talk to a person on the team.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {QUICKSTART.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group flex flex-col rounded-lg border border-rule bg-paper p-6 shadow-1 transition-shadow hover:shadow-2"
            >
              <Icon name={c.icon} size={20} className="text-amber-ink" />
              <div className="mt-3 text-heading-md text-ink">{c.title}</div>
              <div className="mt-2 text-body-sm text-ink-3">{c.body}</div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-body-sm text-amber-ink">
                Read
                <Icon name="arrowRight" size={12} />
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-[1.3fr_1fr]">
          <div className="rounded-lg border border-rule bg-paper">
            <div className="border-b border-rule px-6 py-4">
              <div className="text-heading-md text-ink">Frequently asked</div>
            </div>
            <div className="px-6">
              {FAQS.map((f) => (
                <FAQItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-lg border border-rule bg-paper p-6 shadow-1">
              <div className="text-heading-md text-ink">Talk to a person</div>
              <div className="mt-1 text-caption text-ink-3">
                Email response within 4 hours on weekdays.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="primary" size="sm">
                  <a href="mailto:hello@creatorcanon.com">
                    <Icon name="chat" size={12} />
                    Chat with us
                  </a>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <a href="mailto:hello@creatorcanon.com">hello@creatorcanon.com</a>
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-rule bg-paper-warm p-6 shadow-1">
              <Icon name="users" size={18} className="text-amber-ink" />
              <div className="mt-3 text-heading-md text-ink">Join the creator salon</div>
              <div className="mt-2 text-body-sm text-ink-3">
                A private Discord for creators using CreatorCanon. Weekly critiques, patterns that work,
                patterns that flop.
              </div>
              <Button asChild variant="secondary" size="sm" className="mt-4">
                <a href="mailto:hello@creatorcanon.com?subject=Creator%20salon%20access">
                  Request access
                  <Icon name="arrowRight" size={12} />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
