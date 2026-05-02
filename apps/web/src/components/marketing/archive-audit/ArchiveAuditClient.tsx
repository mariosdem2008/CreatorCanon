'use client';

import { useFormState } from 'react-dom';

import { Icon, type IconName } from '@creatorcanon/ui';

import {
  runArchiveAuditAction,
  type ArchiveAuditActionState,
} from '@/app/(marketing)/archive-audit/actions';
import { AuditEmptyPreview } from './AuditEmptyPreview';
import { AuditReport } from './AuditReport';
import { AuditUrlForm } from './AuditUrlForm';

const initialState: ArchiveAuditActionState = { status: 'idle' };

export function ArchiveAuditClient() {
  const [state, formAction] = useFormState(runArchiveAuditAction, initialState);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="border-b border-rule bg-paper-warm">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-6 py-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:py-16">
          <div className="min-w-0">
            <div className="border-amber/25 inline-flex items-center gap-2 rounded-full border bg-amber-wash px-3 py-1 text-caption text-amber-ink">
              <Icon name="sparkle" size={13} />
              Free Archive Audit
            </div>
            <h1 className="mt-5 max-w-[760px] font-serif text-display-lg text-ink">
              See what your YouTube archive could become.
            </h1>
            <p className="mt-5 max-w-[62ch] text-body-lg leading-relaxed text-ink-2">
              Paste your channel URL. CreatorCanon scans public channel data and available
              transcript samples, then maps the knowledge product hiding in your archive.
            </p>
            <AuditUrlForm action={formAction} state={state} />
          </div>

          <div className="min-w-0">
            {state.status === 'success' ? <HeroResultCard state={state} /> : <AuditEmptyPreview />}
          </div>
        </div>
      </section>

      {state.status === 'success' ? (
        <AuditReport report={state.report} auditId={state.auditId} />
      ) : (
        <PreReportContent />
      )}
    </main>
  );
}

function HeroResultCard({
  state,
}: {
  state: Extract<ArchiveAuditActionState, { status: 'success' }>;
}) {
  const memo = state.report.auditMemo;

  return (
    <div className="border border-rule bg-paper p-5 shadow-pop">
      <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
        <div>
          <p className="text-caption uppercase text-ink-4">Audit complete</p>
          <h2 className="mt-1 font-serif text-heading-lg text-ink">{state.report.channel.title}</h2>
        </div>
        <div className="max-w-[180px] text-right">
          <p className="text-caption uppercase text-amber-ink">Best first hub</p>
          <p className="mt-1 text-body-sm font-medium leading-snug text-ink">{memo.bestFirstHub}</p>
        </div>
      </div>
      <p className="mt-4 text-body-md leading-relaxed text-ink-2">
        {memo.headlineFinding}
      </p>
      <div className="mt-5 grid gap-2 text-body-sm text-ink-3">
        <span className="inline-flex items-center gap-2">
          <Icon name="video" size={14} className="text-amber-ink" />
          {state.report.scanned.videoCount} public videos reviewed
        </span>
        <span className="inline-flex items-center gap-2">
          <Icon name="check2" size={14} className="text-amber-ink" />
          Public data only
        </span>
        <span className="inline-flex items-center gap-2">
          <Icon name="layers" size={14} className="text-amber-ink" />
          {memo.recommendedHub.firstPages.length} starter pages suggested
        </span>
      </div>
    </div>
  );
}

function PreReportContent() {
  return (
    <section className="border-b border-rule bg-paper">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-6 py-14 md:grid-cols-3">
        {[
          [
            'target',
            'Positioning',
            'Find the audience and authority angle already implied by your archive.',
          ],
          [
            'library',
            'Inventory',
            'Surface frameworks, playbooks, stories, and proof moments worth packaging.',
          ],
          [
            'credit',
            'Monetization',
            'See where a cited hub can support reputation, leads, and paid access.',
          ],
        ].map(([icon, title, body]) => (
          <div key={title} className="border-amber/60 border-l-2 pl-5">
            <Icon name={icon as IconName} size={18} className="text-amber-ink" />
            <h2 className="mt-3 text-heading-md text-ink">{title}</h2>
            <p className="mt-2 text-body-sm leading-relaxed text-ink-3">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
