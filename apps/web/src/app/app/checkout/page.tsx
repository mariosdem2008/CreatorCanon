import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { createStripeClient } from '@creatorcanon/adapters';
import { formatUsdCents, parseServerEnv } from '@creatorcanon/core';
import { and, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  project,
  videoSetItem,
  workspaceMember,
} from '@creatorcanon/db/schema';

import { startCheckout } from './actions';

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
      paymentProcessing = sessionResult.payment_status === 'paid' || sessionResult.status === 'complete';
    } catch {
      paymentProcessing = true;
    }
  }

  return (
    <main className="min-h-screen bg-paper-studio">
      <div className="flex items-center justify-between border-b border-rule-dark bg-paper px-8 py-5">
        <div>
          <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
            Creator Studio
          </div>
          <h1 className="font-serif text-heading-lg text-ink">Checkout</h1>
        </div>
        <Link
          href={`/app/projects/${projectId}`}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
        >
          ← Project status
        </Link>
      </div>

      <div className="mx-auto max-w-[720px] space-y-6 px-8 py-10">
        {searchParams?.canceled === '1' && (
          <section className="rounded-lg border border-rule bg-paper p-6 text-body-sm text-ink-3">
            Checkout was canceled. Your run is still saved and waiting for payment.
          </section>
        )}

        {paymentProcessing && (
          <section className="rounded-lg border border-sage/30 bg-sage/10 p-6">
            <h2 className="text-body-md font-medium text-ink">Payment received</h2>
            <p className="mt-2 text-body-sm text-ink-3">
              Stripe has accepted the payment. CreatorCanon is waiting for webhook confirmation before queueing your run.
            </p>
          </section>
        )}

        <section className="rounded-lg border border-rule bg-paper p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-body-md font-medium text-ink">{proj.title}</h2>
              <p className="mt-1 text-body-sm text-ink-4">Run status: awaiting payment</p>
            </div>
            <div className="text-right">
              <p className="text-heading-sm font-medium text-ink">
                {formatUsdCents(run.priceCents ?? 0)}
              </p>
              <p className="text-caption text-ink-4">One-time generation payment</p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-4 rounded-md border border-rule bg-paper-2 p-4 text-center">
            <div>
              <dt className="text-caption text-ink-4">Videos</dt>
              <dd className="mt-1 font-mono text-body-md text-ink">{videoCount}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-4">Duration</dt>
              <dd className="mt-1 font-mono text-body-md text-ink">
                {fmtDuration(run.selectedDurationSeconds)}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-4">Pipeline</dt>
              <dd className="mt-1 font-mono text-body-md text-ink">{run.pipelineVersion}</dd>
            </div>
          </dl>

          <p className="text-body-sm text-ink-3">
            Payment is required before CreatorCanon queues the run. After Stripe confirms the charge, the existing worker flow will start automatically.
          </p>

          <form action={startCheckout} className="flex items-center justify-between rounded-lg border border-rule-dark bg-paper p-5">
            <input type="hidden" name="project_id" value={projectId} />
            <div>
              <p className="text-heading-sm font-medium text-ink">{formatUsdCents(run.priceCents ?? 0)}</p>
              <p className="text-body-sm text-ink-4">
                {videoCount} video{videoCount === 1 ? '' : 's'} · {fmtDuration(run.selectedDurationSeconds)}
              </p>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-6 text-body-sm font-medium text-paper transition hover:opacity-90"
            >
              Pay to queue run
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
