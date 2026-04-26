import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createStripeClient } from '@creatorcanon/adapters';
import { formatUsdCents, parseServerEnv } from '@creatorcanon/core';
import { and, eq, getDb } from '@creatorcanon/db';
import { generationRun, project, videoSetItem } from '@creatorcanon/db/schema';

import {
  NoticeBanner,
  PageHeader,
  Panel,
  PanelHeader,
} from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

import { startCheckout } from './actions';
import { CheckoutSubmitButton } from './CheckoutSubmitButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Checkout' };

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
  const { workspaceId } = await requireWorkspace();
  const projectId = searchParams?.projectId?.trim();
  if (!projectId) redirect('/app/projects');

  const db = getDb();
  const projects = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);
  const proj = projects[0];
  if (!proj?.currentRunId) redirect('/app/projects');

  const runs = await db
    .select()
    .from(generationRun)
    .where(
      and(eq(generationRun.id, proj.currentRunId), eq(generationRun.workspaceId, workspaceId)),
    )
    .limit(1);
  const run = runs[0];
  if (!run) redirect('/app/projects');
  if (run.status !== 'awaiting_payment') redirect(`/app/projects/${projectId}`);

  const videoCount = proj.videoSetId
    ? (await db.select().from(videoSetItem).where(eq(videoSetItem.videoSetId, proj.videoSetId)))
        .length
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
    <div className="space-y-4">
      <PageHeader
        eyebrow="Checkout"
        title="Confirm payment to queue generation."
        body="Stripe confirms the one-time payment, then CreatorCanon moves the run into the worker queue automatically."
        actions={
          <Link
            href={`/app/projects/${projectId}`}
            className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
          >
            Project status
          </Link>
        }
      />

      {searchParams?.canceled === '1' ? (
        <NoticeBanner
          tone="warn"
          badge="Canceled"
          title="Checkout was canceled."
          body="Your run is still saved and waiting for payment. Come back whenever you're ready."
        />
      ) : null}

      {paymentProcessing ? (
        <NoticeBanner
          tone="success"
          badge="Paid"
          title="Payment received."
          body="Stripe accepted the payment. Waiting on webhook confirmation before queueing the run."
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Run checkpoint" />
            <div className="grid gap-px bg-[var(--cc-rule)] md:grid-cols-3">
              <Checkpoint n="1" title="Payment" body="Complete secure Stripe checkout." active />
              <Checkpoint
                n="2"
                title="Generation"
                body="Worker extracts transcripts and drafts pages."
              />
              <Checkpoint
                n="3"
                title="Review"
                body="Approve pages before publishing."
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="What happens next" />
            <div className="space-y-3 p-5">
              <NextItem
                title="Run enters the queue"
                body="The webhook updates the run from awaiting payment to queued, then the worker picks it up."
              />
              <NextItem
                title="Atlas drafts the first review artifact"
                body="The pipeline normalizes source material, segments transcripts, and creates a review summary."
              />
              <NextItem
                title="Draft pages appear in the project"
                body="You review, edit, approve, and publish from the project workspace."
              />
            </div>
          </Panel>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[66px] lg:self-start">
          <Panel>
            <PanelHeader title="Order summary" meta="One-time alpha run" />
            <div className="space-y-3 p-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                  Hub project
                </p>
                <h2 className="mt-1.5 text-[18px] font-semibold leading-tight text-[var(--cc-ink)]">
                  {proj.title}
                </h2>
              </div>

              <div className="divide-y divide-[var(--cc-rule)] border-y border-[var(--cc-rule)]">
                <SummaryRow
                  label="Videos included"
                  value={`${videoCount} video${videoCount === 1 ? '' : 's'}`}
                />
                <SummaryRow
                  label="Source runtime"
                  value={fmtDuration(run.selectedDurationSeconds)}
                />
                <SummaryRow label="Pipeline" value={run.pipelineVersion} mono />
                <SummaryRow label="Run status" value="Awaiting payment" />
              </div>

              <form action={startCheckout} className="space-y-3">
                <input type="hidden" name="project_id" value={projectId} />
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] text-[var(--cc-ink-4)] uppercase tracking-[0.1em]">
                      Total due today
                    </p>
                    <p className="mt-1 text-[12px] text-[var(--cc-ink-3)]">
                      One-time alpha run
                    </p>
                  </div>
                  <p className="text-[28px] font-semibold leading-none text-[var(--cc-ink)] tabular-nums">
                    {formatUsdCents(run.priceCents ?? 0)}
                  </p>
                </div>

                <CheckoutSubmitButton />

                <p className="text-center text-[11px] leading-[1.5] text-[var(--cc-ink-4)]">
                  Secure checkout via Stripe. No subscription is created.
                </p>
              </form>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function Checkpoint({
  n,
  title,
  body,
  active,
}: {
  n: string;
  title: string;
  body: string;
  active?: boolean;
}) {
  return (
    <div
      className={`bg-[var(--cc-surface)] px-5 py-4 ${
        active ? 'shadow-[inset_3px_0_0_var(--cc-accent)]' : ''
      }`}
    >
      <span
        className={`grid size-6 place-items-center rounded-[6px] text-[11px] font-semibold ${
          active
            ? 'bg-[var(--cc-accent)] text-white'
            : 'bg-[var(--cc-surface-2)] text-[var(--cc-ink-4)]'
        }`}
      >
        {n}
      </span>
      <p className="mt-2.5 text-[13px] font-semibold text-[var(--cc-ink)]">{title}</p>
      <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">{body}</p>
    </div>
  );
}

function NextItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)] px-4 py-3">
      <p className="text-[13px] font-semibold text-[var(--cc-ink)]">{title}</p>
      <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">{body}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
      <span className="text-[var(--cc-ink-4)]">{label}</span>
      <span
        className={`text-right font-semibold text-[var(--cc-ink)] ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
