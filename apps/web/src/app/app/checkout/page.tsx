import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createStripeClient } from '@creatorcanon/adapters';
import { auth } from '@creatorcanon/auth';
import { formatUsdCents, parseServerEnv } from '@creatorcanon/core';
import { and, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  project,
  videoSetItem,
  workspaceMember,
} from '@creatorcanon/db/schema';

import { startCheckout } from './actions';
import { CheckoutSubmitButton } from './CheckoutSubmitButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Checkout' };

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams?: {
    projectId?: string;
    success?: string;
    canceled?: string;
    session_id?: string;
  };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const projectId = searchParams?.projectId?.trim();
  if (!projectId) redirect('/app');

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) redirect('/app');

  const projects = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);

  const proj = projects[0];
  if (!proj?.currentRunId) redirect('/app');

  const runs = await db
    .select()
    .from(generationRun)
    .where(and(eq(generationRun.id, proj.currentRunId), eq(generationRun.workspaceId, workspaceId)))
    .limit(1);

  const run = runs[0];
  if (!run) redirect('/app');
  if (run.status !== 'awaiting_payment') {
    redirect(`/app/projects/${projectId}`);
  }

  const videoCount = proj.videoSetId
    ? (await db.select().from(videoSetItem).where(eq(videoSetItem.videoSetId, proj.videoSetId))).length
    : 0;

  let paymentProcessing = false;
  if (searchParams?.success === '1' && searchParams.session_id) {
    try {
      const env = parseServerEnv(process.env);
      const stripe = createStripeClient(env);
      const sessionResult = await stripe.retrieveCheckout(searchParams.session_id);
      paymentProcessing =
        sessionResult.payment_status === 'paid' || sessionResult.status === 'complete';
    } catch {
      paymentProcessing = true;
    }
  }

  return (
    <main className="min-h-screen bg-paper-studio">
      <div className="flex items-center justify-between border-b border-rule-dark bg-paper px-4 py-4 sm:px-8 sm:py-5">
        <div>
          <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
            Creator Studio
          </div>
          <h1 className="font-serif text-heading-lg text-ink">Checkout</h1>
          <p className="mt-1 text-body-sm text-ink-4">
            Step 3 of 4. Confirm the run and send it into generation.
          </p>
        </div>
        <Link
          href={`/app/projects/${projectId}`}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          aria-label="Back to project status"
        >
          <span aria-hidden="true">&larr;</span>
          <span className="hidden sm:inline">Project status</span>
        </Link>
      </div>

      <div className="mx-auto max-w-[520px] space-y-6 px-4 py-8 sm:px-8 sm:py-10">
        <div className="rounded-2xl border border-rule bg-paper px-5 py-4 shadow-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-eyebrow uppercase tracking-widest text-ink-4">Run checkpoint</p>
              <h2 className="mt-2 font-serif text-heading-md text-ink">
                Everything is staged and waiting for payment
              </h2>
              <p className="mt-2 text-body-sm leading-relaxed text-ink-3">
                Once Stripe confirms the charge, this run moves from draft setup into queueing
                automatically.
              </p>
            </div>
            <div className="rounded-xl border border-rule bg-paper-2 px-3 py-2 text-right">
              <p className="text-eyebrow uppercase tracking-widest text-ink-4">Next</p>
              <p className="mt-1 text-body-sm font-semibold text-ink">Review draft</p>
            </div>
          </div>
        </div>

        {searchParams?.canceled === '1' && (
          <div
            className="flex items-start gap-2.5 rounded-xl border border-rule bg-paper px-4 py-4"
            role="alert"
          >
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-ink-4"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v4M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-body-sm font-medium text-ink">Checkout was canceled</p>
              <p className="mt-1 text-caption leading-relaxed text-ink-3">
                Your run is still saved and waiting for payment. Come back whenever you&apos;re ready.
              </p>
            </div>
          </div>
        )}

        {paymentProcessing && (
          <div
            className="rounded-xl border border-sage/30 bg-sage/8 px-4 py-4"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sage" aria-hidden="true" />
              <p className="text-body-sm font-semibold text-sage">Payment received</p>
            </div>
            <p className="mt-2 text-body-sm leading-relaxed text-ink-3">
              Stripe has accepted the payment. CreatorCanon is waiting for webhook confirmation
              before queueing your run.
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-1">
          <div className="border-b border-rule bg-paper-2 px-5 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-eyebrow uppercase tracking-widest text-ink-4">Hub project</p>
                <h2 className="mt-1 line-clamp-2 font-serif text-heading-md text-ink">
                  {proj.title}
                </h2>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-serif text-heading-lg text-ink">
                  {formatUsdCents(run.priceCents ?? 0)}
                </p>
                <p className="text-caption text-ink-4">one-time</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-rule px-5 sm:px-6">
            <div className="flex items-center justify-between gap-4 py-3 text-body-sm">
              <span className="text-ink-3">Videos included</span>
              <span className="shrink-0 font-medium text-ink">
                {videoCount} video{videoCount === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3 text-body-sm">
              <span className="text-ink-3">Source audio</span>
              <span className="shrink-0 font-medium text-ink">
                {fmtDuration(run.selectedDurationSeconds)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3 text-body-sm">
              <span className="text-ink-3">Expected delivery</span>
              <span className="shrink-0 font-medium text-ink">~4 minutes</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3 text-body-sm">
              <span className="text-ink-3">Pipeline</span>
              <span className="shrink-0 font-mono text-caption text-ink-4">
                {run.pipelineVersion}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3 text-body-sm">
              <span className="text-ink-3">Run status</span>
              <span className="shrink-0 rounded-full border border-amber/20 bg-amber-wash px-2.5 py-1 text-caption font-medium text-amber-ink">
                Awaiting payment
              </span>
            </div>
          </div>

          <div className="border-t border-rule-dark bg-paper-2 px-5 py-5 sm:px-6">
            <form action={startCheckout} className="space-y-4">
              <input type="hidden" name="project_id" value={projectId} />

              <div className="flex items-center justify-between">
                <p className="text-body-sm font-semibold text-ink">Total</p>
                <p className="font-serif text-heading-md text-ink">
                  {formatUsdCents(run.priceCents ?? 0)}
                </p>
              </div>

              <div className="rounded-xl border border-rule bg-paper px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-sage" aria-hidden="true" />
                  <div>
                    <p className="text-body-sm font-semibold text-ink">What happens after payment</p>
                    <p className="mt-1 text-caption leading-relaxed text-ink-4">
                      CreatorCanon starts the run, assembles the first review artifact, and returns
                      you to the project flow once draft outputs are available.
                    </p>
                  </div>
                </div>
              </div>

              <CheckoutSubmitButton />

              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-caption text-ink-4">
                <div className="flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <rect x="1" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M4 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Secure Stripe checkout
                </div>
                <span aria-hidden="true" className="hidden sm:inline">
                  ·
                </span>
                <span>No subscription - one-time payment</span>
              </div>
            </form>
          </div>
        </div>

        <p className="text-center text-caption text-ink-4">
          After Stripe confirms the charge, the generation run starts automatically. You&apos;ll be
          able to track progress from the project status page.
        </p>
      </div>
    </main>
  );
}
