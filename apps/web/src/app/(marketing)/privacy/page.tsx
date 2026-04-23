import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Privacy policy — CreatorCanon',
  description: 'CreatorCanon privacy policy — placeholder pending full legal copy.',
  openGraph: {
    title: 'Privacy policy — CreatorCanon',
    description: 'How CreatorCanon handles your data: OAuth tokens, transcript retention, GDPR rights, and analytics.',
    url: 'https://www.creatorcanon.com/privacy',
  },
  twitter: {
    title: 'Privacy policy — CreatorCanon',
    description: 'How CreatorCanon handles your data: OAuth tokens, transcript retention, GDPR rights, and analytics.',
  },
};

export default function PrivacyPage() {
  return (
    <section className="border-b border-rule bg-paper" aria-label="Privacy policy">
      <div className="mx-auto max-w-[720px] px-6 py-20">
        <Badge variant="default">Placeholder</Badge>
        <h1 className="mt-5 font-serif text-display-lg text-ink">Privacy policy</h1>
        <p className="mt-6 font-serif text-body-lg leading-relaxed text-ink-2">
          Full privacy policy drafted in ticket 10.6. This page is a placeholder so the footer
          link resolves during pre-launch. The production policy will cover data collection,
          YouTube OAuth scope usage, transcript and artifact retention in R2, cookie and analytics
          behavior, subprocessors, and GDPR / CCPA rights.
        </p>
        <div className="mt-10 rounded-lg border border-rule bg-paper-warm p-6 shadow-1">
          <div className="text-eyebrow uppercase text-ink-4">Summary of intent</div>
          <ul className="mt-4 space-y-3 text-body-md text-ink-2">
            <li>
              OAuth refresh tokens are encrypted at rest and used only to read videos and
              captions the creator selects.
            </li>
            <li>
              Transcripts, atoms, and generated pages are retained for at least 60 days and the
              last 3 releases per hub.
            </li>
            <li>
              Non-essential cookies are gated behind a consent banner; analytics is PostHog with
              IP scrubbing.
            </li>
            <li>
              GDPR export and hard-delete are self-serve from Settings → Advanced.
            </li>
          </ul>
        </div>
        <p className="mt-10 text-body-sm text-ink-3">
          Questions before the full policy lands? Email{' '}
          <a
            href="mailto:privacy@creatorcanon.com"
            className="text-amber-ink underline-offset-4 hover:underline"
          >
            privacy@creatorcanon.com
          </a>
          .
        </p>
      </div>
    </section>
  );
}
