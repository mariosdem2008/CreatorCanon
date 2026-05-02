import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icon, type IconName } from '@creatorcanon/ui';
import type { AuditReport as AuditReportData } from '@creatorcanon/pipeline/audit';

import { buildAuditCtaUrl } from '@/app/(marketing)/archive-audit/audit-view-model';
import { generateHubFromAuditAction } from '@/app/(marketing)/archive-audit/generate-hub-action';
import { Button } from '@/components/ui/button';

interface AuditReportProps {
  report: AuditReportData;
  auditId: string;
}

export function AuditReport({ report, auditId }: AuditReportProps) {
  const memo = report.auditMemo;
  const ctaUrl = buildAuditCtaUrl(report.channel.url);

  return (
    <>
      <section className="border-t border-rule bg-paper">
        <div className="mx-auto max-w-[980px] px-6 py-14">
          <div className="border border-rule bg-paper-warm p-6 md:p-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber/40 bg-amber-wash px-3 py-1 text-caption uppercase text-amber-ink">
                  <Icon name="book" size={14} />
                  Archive Audit
                </div>
                <h2 className="mt-5 font-serif text-display-sm text-ink">
                  {report.channel.title} Archive Audit
                </h2>
                <p className="mt-3 max-w-[64ch] text-body-md leading-relaxed text-ink-2">
                  A simple review of {report.channel.title}&apos;s public YouTube archive to see
                  what knowledge product could be built from existing videos.
                </p>
              </div>
              <div className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-4">
                Audit {auditId}
              </div>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden border border-rule bg-rule md:grid-cols-2 lg:grid-cols-4">
              <HeaderFact label="Prepared for" value={report.channel.title} />
              <HeaderFact label="Prepared by" value="CreatorCanon" />
              <HeaderFact label="Videos reviewed" value={`${report.scanned.videoCount} public videos`} />
              <HeaderFact
                label="Main goal"
                value="Find a focused hub that could become a lead magnet, paid resource, or course support asset."
              />
            </div>
          </div>

          <MemoCallout icon="check2" label="Main finding" tone="success">
            <p className="text-heading-md text-ink">{memo.headlineFinding}</p>
            <p className="mt-3 text-body-md text-ink-2">
              The best first hub would be:{' '}
              <span className="font-semibold text-ink">{memo.bestFirstHub}</span>
            </p>
          </MemoCallout>

          <MemoSection number="1" title="What I noticed">
            <p className="max-w-[74ch] text-body-md leading-relaxed text-ink-2">
              {memo.whatINoticed.summary}
            </p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <SimpleList title="Repeated topics" items={memo.whatINoticed.repeatedTopics} />
              <SimpleList title="Current friction" items={memo.whatINoticed.currentFriction} />
            </div>
          </MemoSection>

          <MemoCallout icon="sparkle" label="The opportunity" tone="accent">
            <p className="text-body-lg leading-relaxed text-ink">{memo.whatINoticed.opportunity}</p>
          </MemoCallout>

          <MemoSection number="2" title="Fit score">
            <p className="max-w-[72ch] text-body-md leading-relaxed text-ink-2">
              This is a quick score for whether the archive is worth turning into a knowledge hub.
            </p>
            <div className="mt-5 overflow-hidden border border-rule">
              <table className="w-full border-collapse text-left text-body-sm">
                <thead className="bg-paper-2 text-caption uppercase text-ink-4">
                  <tr>
                    <th className="border-b border-rule px-4 py-3 font-medium">Signal</th>
                    <th className="border-b border-rule px-4 py-3 font-medium">Score</th>
                    <th className="border-b border-rule px-4 py-3 font-medium">Why it matters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule bg-paper">
                  {memo.fitScoreRows.map((row) => (
                    <tr key={row.signal}>
                      <td className="px-4 py-3 font-medium text-ink">{row.signal}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-ink">
                        {formatScore(row.score)}/10
                      </td>
                      <td className="px-4 py-3 text-ink-3">{row.whyItMatters}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MemoSection>

          <MemoSection number="3" title="Recommended first hub">
            <div className="border-l-2 border-amber pl-5">
              <div className="flex items-center gap-2 text-caption uppercase text-amber-ink">
                <Icon name="atlas" size={14} />
                Build this first
              </div>
              <h3 className="mt-2 font-serif text-heading-lg text-ink">{memo.recommendedHub.name}</h3>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              <CopyBlock label="For" value={memo.recommendedHub.targetAudience} />
              <CopyBlock label="Outcome" value={memo.recommendedHub.outcome} />
              <CopyBlock label="Why this first" value={memo.recommendedHub.whyThisFirst} />
            </div>
            <SimpleList
              className="mt-6"
              title="First pages I would create"
              items={memo.recommendedHub.firstPages}
            />
          </MemoSection>

          <MemoSection number="4" title="Example page">
            <div className="bg-paper-2 p-5">
              <h3 className="font-serif text-heading-lg text-ink">{memo.examplePage.title}</h3>
              <p className="mt-3 text-body-md leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">Simple summary:</span>{' '}
                {memo.examplePage.simpleSummary}
              </p>
              <SimpleList
                className="mt-6"
                title="The recommended path"
                items={memo.examplePage.recommendedPath}
                ordered
              />
              <p className="mt-6 text-body-md leading-relaxed text-ink-2">
                {memo.examplePage.archiveConnection}
              </p>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="border border-rule bg-paper p-4">
                <div className="flex items-center gap-2 text-caption uppercase text-amber-ink">
                  <Icon name="video" size={14} />
                  Source videos used
                </div>
                <ul className="mt-3 space-y-2">
                  {memo.examplePage.sourceVideosUsed.map((video) => (
                    <li key={video.videoId} className="text-body-sm leading-relaxed text-ink-2">
                      {video.title}
                    </li>
                  ))}
                </ul>
              </div>
              <SimpleList title="Takeaways" items={memo.examplePage.takeaways} />
            </div>
          </MemoSection>

          <MemoSection number="5" title="How this could help the business">
            <div className="grid gap-4 md:grid-cols-2">
              <CopyBlock label="Lead magnet" value={memo.businessUses.leadMagnet} />
              <CopyBlock label="Paid mini-product" value={memo.businessUses.paidMiniProduct} />
              <CopyBlock label="Course or community support" value={memo.businessUses.courseSupport} />
              <CopyBlock label="Authority asset" value={memo.businessUses.authorityAsset} />
            </div>
          </MemoSection>
        </div>
      </section>

      <section className="bg-ink text-paper">
        <div className="mx-auto flex max-w-[980px] flex-col justify-between gap-6 px-6 py-12 md:flex-row md:items-center">
          <div>
            <p className="text-caption uppercase text-paper-2/60">Next step</p>
            <h2 className="mt-2 font-serif text-display-sm">{report.creatorCanonFit.cta}</h2>
            <p className="mt-3 max-w-[54ch] text-body-sm leading-relaxed text-paper-2/70">
              Generate a Creator Manual project from this audit. If you are not signed in, CreatorCanon
              will ask you to sign in first.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col">
            <form action={generateHubFromAuditAction}>
              <input type="hidden" name="audit_id" value={auditId} />
              <Button type="submit" variant="accent" size="lg">
                Generate Hub
                <Icon name="arrowRight" size={14} />
              </Button>
            </form>
            <Button asChild variant="secondary" size="lg">
              <Link href={ctaUrl}>Request alpha access</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper p-4">
      <div className="text-caption uppercase text-ink-4">{label}</div>
      <div className="mt-2 text-body-sm leading-relaxed text-ink">{value}</div>
    </div>
  );
}

function MemoSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-rule py-9">
      <div className="mb-5 flex items-center gap-3">
        <span className="font-mono text-caption text-amber-ink">{number}</span>
        <h2 className="font-serif text-heading-lg text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MemoCallout({
  icon,
  label,
  tone,
  children,
}: {
  icon: IconName;
  label: string;
  tone: 'success' | 'accent';
  children: ReactNode;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-sage bg-sage/10 text-sage'
      : 'border-amber bg-amber-wash text-amber-ink';

  return (
    <section className={`mt-6 border-l-2 p-5 ${toneClass}`}>
      <div className="mb-3 flex items-center gap-2 text-caption uppercase">
        <Icon name={icon} size={14} />
        {label}
      </div>
      {children}
    </section>
  );
}

function SimpleList({
  title,
  items,
  ordered = false,
  className = '',
}: {
  title: string;
  items: string[];
  ordered?: boolean;
  className?: string;
}) {
  const ListTag = ordered ? 'ol' : 'ul';

  return (
    <div className={className}>
      <h3 className="text-heading-sm text-ink">{title}</h3>
      <ListTag className="mt-3 space-y-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-2 text-body-sm leading-relaxed text-ink-2">
            <span className="mt-0.5 shrink-0 font-mono text-caption text-amber-ink">
              {ordered ? String(index + 1).padStart(2, '0') : '-'}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ListTag>
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-amber/60 pl-4">
      <div className="text-caption uppercase text-ink-4">{label}</div>
      <p className="mt-1 text-body-sm leading-relaxed text-ink-2">{value}</p>
    </div>
  );
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}
