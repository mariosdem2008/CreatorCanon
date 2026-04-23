import { NextResponse } from 'next/server';
import { tasks } from '@trigger.dev/sdk/v3';

import { createStripeClient } from '@creatorcanon/adapters';
import {
  parseServerEnv,
  PIPELINE_VERSION,
} from '@creatorcanon/core';
import { and, eq, getDb } from '@creatorcanon/db';
import {
  customer,
  generationRun,
  project,
  stripeEvent,
} from '@creatorcanon/db/schema';
import {
  runGenerationPipeline,
  type RunGenerationPipelinePayload,
} from '@creatorcanon/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function runInProcess(payload: RunGenerationPipelinePayload): void {
  void runGenerationPipeline(payload).catch((err) => {
    console.error('[stripe-webhook] In-process pipeline run failed:', err);
  });
}

async function dispatchPipeline(payload: RunGenerationPipelinePayload): Promise<void> {
  const mode = process.env.PIPELINE_DISPATCH_MODE ?? 'inprocess';
  if (mode === 'trigger') {
    try {
      await tasks.trigger('run-pipeline', payload);
      return;
    } catch (error) {
      console.warn('[stripe-webhook] Failed to trigger pipeline task, falling back in-process:', error);
    }
  }
  runInProcess(payload);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const env = parseServerEnv(process.env);
  const stripe = createStripeClient(env);

  let handled;
  try {
    handled = await stripe.handleWebhook(null, signature, rawBody);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook verification failed' },
      { status: 400 },
    );
  }

  const event = handled.event;
  const db = getDb();

  const existingRows = await db
    .select()
    .from(stripeEvent)
    .where(eq(stripeEvent.stripeEventId, event.id))
    .limit(1);

  let stripeEventId = existingRows[0]?.id;
  if (existingRows[0]?.processedAt) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  if (!stripeEventId) {
    stripeEventId = crypto.randomUUID();
    await db.insert(stripeEvent).values({
      id: stripeEventId,
      workspaceId: typeof event.data.object === 'object' && event.data.object && 'metadata' in event.data.object
        ? ((event.data.object as { metadata?: Record<string, string> }).metadata?.workspaceId ?? null)
        : null,
      stripeEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
      livemode: event.livemode,
    });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const workspaceId = session.metadata?.workspaceId;
      const projectId = session.metadata?.projectId;
      const runId = session.metadata?.runId;

      if (workspaceId && projectId && runId) {
        const runs = await db
          .select()
          .from(generationRun)
          .where(and(eq(generationRun.id, runId), eq(generationRun.workspaceId, workspaceId)))
          .limit(1);

        const run = runs[0];
        if (run && run.status === 'awaiting_payment') {
          await db
            .update(generationRun)
            .set({
              status: 'queued',
              stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
              updatedAt: new Date(),
            })
            .where(eq(generationRun.id, runId));

          if (session.customer && typeof session.customer === 'string') {
            const existingCustomers = await db
              .select({ id: customer.id })
              .from(customer)
              .where(eq(customer.workspaceId, workspaceId))
              .limit(1);

            if (existingCustomers[0]) {
              await db
                .update(customer)
                .set({
                  stripeCustomerId: session.customer,
                  email: session.customer_details?.email ?? null,
                  updatedAt: new Date(),
                })
                .where(eq(customer.id, existingCustomers[0].id));
            } else {
              await db.insert(customer).values({
                id: crypto.randomUUID(),
                workspaceId,
                stripeCustomerId: session.customer,
                email: session.customer_details?.email ?? null,
                livemode: event.livemode,
                metadata: {
                  source: 'checkout.session.completed',
                },
              });
            }
          }

          const projects = await db
            .select({ videoSetId: project.videoSetId })
            .from(project)
            .where(and(eq(project.id, projectId), eq(project.workspaceId, workspaceId)))
            .limit(1);

          const videoSetId = projects[0]?.videoSetId;
          if (videoSetId) {
            const payload: RunGenerationPipelinePayload = {
              runId,
              projectId,
              workspaceId,
              videoSetId,
              pipelineVersion: run.pipelineVersion || PIPELINE_VERSION,
            };
            await dispatchPipeline(payload);
          }
        }
      }
    }

    await db
      .update(stripeEvent)
      .set({
        processedAt: new Date(),
        processingError: null,
      })
      .where(eq(stripeEvent.id, stripeEventId!));

    return NextResponse.json({ ok: true });
  } catch (error) {
    await db
      .update(stripeEvent)
      .set({
        processingError: error instanceof Error ? error.message : String(error),
      })
      .where(eq(stripeEvent.id, stripeEventId!));

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Webhook processing failed' },
      { status: 500 },
    );
  }
}
