import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'CreatorCanon terms of service — placeholder pending full legal copy.',
};

export default function TermsPage() {
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[720px] px-6 py-20">
        <Badge variant="default">Placeholder</Badge>
        <h1 className="mt-5 font-serif text-display-lg text-ink">Terms of service</h1>
        <p className="mt-6 font-serif text-body-lg leading-relaxed text-ink-2">
          Full terms drafted in ticket 10.6. This page is a placeholder so the footer link
          resolves during pre-launch. The production terms will cover account and workspace
          usage, creator-owned content, payment and refund policy, AI output disclaimers,
          acceptable use, YouTube API compliance, and termination.
        </p>
        <div className="mt-10 rounded-lg border border-rule bg-paper-warm p-6 shadow-1">
          <div className="text-eyebrow uppercase text-ink-4">Summary of intent</div>
          <ul className="mt-4 space-y-3 text-body-md text-ink-2">
            <li>
              Creators own their content. CreatorCanon is a drafting and publishing tool, not a rights
              holder.
            </li>
            <li>
              Hub output is AI-assisted; creators are responsible for final editorial review
              before publish.
            </li>
            <li>
              Refunds are handled on a case-by-case basis within 14 days of generation for clear
              pipeline failures.
            </li>
            <li>
              Workspace deletion removes all data from CreatorCanon databases and R2 artifacts within
              the documented GDPR hard-delete window.
            </li>
          </ul>
        </div>
        <p className="mt-10 text-body-sm text-ink-3">
          Questions before the full terms land? Email{' '}
          <a
            href="mailto:hello@creatorcanon.com"
            className="text-amber-ink underline-offset-4 hover:underline"
          >
            hello@creatorcanon.com
          </a>
          .
        </p>
      </div>
    </section>
  );
}
