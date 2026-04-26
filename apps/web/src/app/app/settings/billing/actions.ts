'use server';

import { redirect } from 'next/navigation';

import { createStripeClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { eq, withDbRetry } from '@creatorcanon/db';
import { customer } from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

/**
 * Owner-only — open the Stripe customer portal for this workspace's customer.
 * Throws when the workspace has never been billed (no `customer` row), so the
 * settings page hides the button until that exists.
 */
export async function openBillingPortal(): Promise<void> {
  const { db, workspaceId, role } = await requireWorkspace();
  if (role !== 'owner') {
    throw new Error('Only workspace owners can open the billing portal.');
  }

  const rows = await withDbRetry(
    () =>
      db
        .select({ stripeCustomerId: customer.stripeCustomerId })
        .from(customer)
        .where(eq(customer.workspaceId, workspaceId))
        .limit(1),
    { label: 'settings:billing-portal-lookup' },
  );

  const stripeCustomerId = rows[0]?.stripeCustomerId;
  if (!stripeCustomerId) {
    throw new Error('No Stripe customer is linked to this workspace yet.');
  }

  const env = parseServerEnv(process.env);
  const stripe = createStripeClient(env);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const session = await stripe.createBillingPortalSession({
    customerId: stripeCustomerId,
    returnUrl: `${appUrl}/app/settings/billing`,
  });

  redirect(session.url);
}
