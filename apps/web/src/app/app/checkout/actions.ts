'use server';

import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { createStripeClient } from '@creatorcanon/adapters';
import { parsePublicEnv, parseServerEnv } from '@creatorcanon/core';
import { and, eq, getDb } from '@creatorcanon/db';
import {
  customer,
  generationRun,
  project,
  workspaceMember,
} from '@creatorcanon/db/schema';

export async function startCheckout(formData: FormData): Promise<{ error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated' };

  const projectId = (formData.get('project_id') as string | null)?.trim();
  if (!projectId) return { error: 'Project is required' };

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) return { error: 'No workspace found' };

  const projects = await db
    .select({
      id: project.id,
      currentRunId: project.currentRunId,
      title: project.title,
    })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
    .limit(1);

  const proj = projects[0];
  if (!proj?.currentRunId) return { error: 'Project run not found' };

  const runs = await db
    .select()
    .from(generationRun)
    .where(and(eq(generationRun.id, proj.currentRunId), eq(generationRun.workspaceId, workspaceId)))
    .limit(1);

  const run = runs[0];
  if (!run) return { error: 'Run not found' };
  if (run.status !== 'awaiting_payment') {
    redirect(`/app/projects/${projectId}`);
  }

  const env = parseServerEnv(process.env);
  const publicEnv = parsePublicEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_HUB_ROOT_DOMAIN: process.env.NEXT_PUBLIC_HUB_ROOT_DOMAIN,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  });
  const stripe = createStripeClient(env);

  let stripeCustomerId: string | undefined;
  const existingCustomers = await db
    .select({
      id: customer.id,
      stripeCustomerId: customer.stripeCustomerId,
    })
    .from(customer)
    .where(eq(customer.workspaceId, workspaceId))
    .limit(1);

  if (existingCustomers[0]) {
    stripeCustomerId = existingCustomers[0].stripeCustomerId;
  } else if (session.user.email) {
    const createdCustomer = await stripe.createCustomer(session.user.email);
    stripeCustomerId = createdCustomer.id;

    await db.insert(customer).values({
      id: crypto.randomUUID(),
      workspaceId,
      stripeCustomerId: createdCustomer.id,
      email: session.user.email,
      livemode: createdCustomer.livemode,
      metadata: {
        source: 'creator_checkout',
      },
    });
  }

  const successUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/app/checkout?projectId=${projectId}&success=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/app/checkout?projectId=${projectId}&canceled=1`;

  const checkout = await stripe.createCheckoutSession({
    customerId: stripeCustomerId,
    amountCents: run.priceCents ?? 2_900,
    currency: 'usd',
    productName: `${proj.title} generation run`,
    mode: 'payment',
    quantity: 1,
    successUrl,
    cancelUrl,
    idempotencyKey: `generation-run-${run.id}`,
    metadata: {
      workspaceId,
      projectId: proj.id,
      runId: run.id,
    },
  });

  redirect(checkout.url);
}
