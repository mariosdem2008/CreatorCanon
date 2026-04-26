import { desc, eq } from '@creatorcanon/db';
import {
  customer,
  generationRun,
  invoice,
  subscription,
} from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

import { SettingsNote, SettingsPanel, SettingsRow } from '../panels';
import { openBillingPortal } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings — Billing' };

export default async function SettingsBillingPage() {
  const { db, workspaceId, role } = await requireWorkspace();

  const [customers, subs, recentInvoices, recentRuns] = await Promise.all([
    db.select().from(customer).where(eq(customer.workspaceId, workspaceId)).limit(1),
    db
      .select()
      .from(subscription)
      .where(eq(subscription.workspaceId, workspaceId))
      .orderBy(desc(subscription.createdAt))
      .limit(1),
    db
      .select()
      .from(invoice)
      .where(eq(invoice.workspaceId, workspaceId))
      .orderBy(desc(invoice.createdAt))
      .limit(5),
    db
      .select({
        id: generationRun.id,
        status: generationRun.status,
        priceCents: generationRun.priceCents,
        createdAt: generationRun.createdAt,
      })
      .from(generationRun)
      .where(eq(generationRun.workspaceId, workspaceId))
      .orderBy(desc(generationRun.createdAt))
      .limit(8),
  ]);

  const billing = customers[0];
  const sub = subs[0];

  const totalSpent = recentRuns.reduce(
    (acc, run) => acc + (run.priceCents ?? 0),
    0,
  );

  return (
    <>
      <SettingsPanel
        title="Customer"
        description="Stripe customer mirror for this workspace."
        meta={billing ? 'Connected' : 'Not yet billed'}
      >
        <SettingsRow
          label="Stripe customer ID"
          value={billing?.stripeCustomerId ?? 'Not created'}
          mono={Boolean(billing?.stripeCustomerId)}
        />
        <SettingsRow label="Billing email" value={billing?.email ?? '—'} />
        <SettingsRow
          label="Live mode"
          value={billing ? (billing.livemode ? 'Yes' : 'Test') : '—'}
        />
        {billing && role === 'owner' ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 px-5 py-3.5">
            <form action={openBillingPortal}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-[8px] bg-[var(--cc-accent)] px-3.5 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] transition hover:bg-[var(--cc-accent-strong)]"
              >
                Open Stripe customer portal
              </button>
            </form>
            <p className="ml-auto text-[11px] text-[var(--cc-ink-4)] max-w-[420px]">
              Manage payment methods, download receipts, and cancel — opens Stripe in a redirect.
            </p>
          </div>
        ) : (
          <SettingsNote>
            Customer portal lights up after the first Stripe checkout — it redirects to
            Stripe&apos;s hosted portal once the workspace has a customer record.
          </SettingsNote>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Subscription"
        description="Optional team-tier subscription state."
      >
        <SettingsRow label="Plan" value={sub?.plan ?? 'Pay-per-hub'} />
        <SettingsRow label="Status" value={sub?.status ?? 'No subscription'} />
        <SettingsRow
          label="Renews"
          value={sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'}
        />
        {!sub ? (
          <SettingsNote tone="pending">
            CreatorCanon alpha is pay-per-hub. Subscriptions activate when the team tier opens.
          </SettingsNote>
        ) : null}
      </SettingsPanel>

      <SettingsPanel
        title="Run ledger"
        description="Generation runs and what each cost."
        meta={`Total: ${formatPrice(totalSpent)}`}
      >
        {recentRuns.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-[var(--cc-ink-4)]">
            No generation runs yet. Pricing appears here after the first checkout.
          </div>
        ) : (
          <div className="divide-y divide-[var(--cc-rule)]">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between gap-3 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[var(--cc-ink-4)]">{run.id}</p>
                  <p className="mt-1 text-[12px] text-[var(--cc-ink-3)]">
                    {run.status.replaceAll('_', ' ')} · {formatDate(run.createdAt)}
                  </p>
                </div>
                <span className="font-mono text-[12px] text-[var(--cc-ink)]">
                  {formatPrice(run.priceCents ?? 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel title="Invoices" description="Latest 5 from Stripe sync.">
        {recentInvoices.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-[var(--cc-ink-4)]">
            No invoices yet.
          </div>
        ) : (
          <div className="divide-y divide-[var(--cc-rule)]">
            {recentInvoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-3 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-[var(--cc-ink-4)]">{inv.stripeInvoiceId}</p>
                  <p className="mt-1 text-[12px] text-[var(--cc-ink-3)]">
                    {inv.status} · {formatDate(inv.createdAt)}
                  </p>
                </div>
                <span className="font-mono text-[12px] text-[var(--cc-ink)]">
                  {formatPrice(inv.amountPaidCents || inv.amountDueCents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SettingsPanel>
    </>
  );
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}
