import { NextResponse } from 'next/server';
import { tasks } from '@trigger.dev/sdk/v3';

import { createStripeClient } from '@creatorcanon/adapters';
import {
  parseServerEnv,
  PIPELINE_VERSION,
} from '@creatorcanon/core';
import { and, eq, getDb, inArray } from '@creatorcanon/db';
import {
  customer,
  generationRun,
  mediaAsset,
  project,
  stripeEvent,
  videoSetItem,
} from '@creatorcanon/db/schema';
import {
  runGenerationPipeline,
  type RunGenerationPipelinePayload,
} from '@creatorcanon/pipeline';

import { buildDispatchPlan, type DispatchMode } from './dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function runInProcess(payload: RunGenerationPipelinePayload): void {
  void runGenerationPipeline(payload).catch((err) => {
    console.error('[stripe-webhook] In-process pipeline run failed:', err);
  });
}

function parseDispatchMode(raw: string | undefined): DispatchMode {
  if (raw === 'trigger' || raw === 'worker') return raw;
  return 'inprocess';
}

async function hasAudioForAllVideos(videoSetId: string, workspaceId: string): Promise<boolean> {
  const db = getDb();
  const items = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, videoSetId));
  if (items.length === 0) return false;
  const videoIds = items.map((i) => i.videoId);
  const audio = await db
    .select({ videoId: mediaAsset.videoId })
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.workspaceId, workspaceId),
        eq(mediaAsset.type, 'audio_m4a'),
        inArray(mediaAsset.videoId, videoIds),
      ),
    );
  const have = new Set(audio.map((r) => r.videoId));
  return items.every((i) => have.has(i.videoId));
}

async function dispatchPipeline(payload: RunGenerationPipelinePayload): Promise<void> {
  const mode = parseDispatchMode(process.env.PIPELINE_DISPATCH_MODE);
  const allAudio = await hasAudioForAllVideos(payload.videoSetId, payload.workspaceId);
  const plan = buildDispatchPlan({ mode, hasAudioForAllVideos: allAudio });

  console.info('[stripe-webhook] dispatch plan', {
    runId: payload.runId,
    mode,
    allAudio,
    planKind: plan.kind,
  });

  if (plan.kind === 'worker-queued') {
    // Long-running queue-runner polls for queued runs; webhook does nothing.
    return;
  }

  if (plan.kind === 'inprocess') {
    runInProcess(payload);
    return;
  }

  if (plan.kind === 'trigger-direct') {
    try {
      await tasks.trigger('run-pipeline', payload);
    } catch (err) {
      console.warn('[stripe-webhook] trigger.run-pipeline failed, falling back in-process:', err);
      runInProcess(payload);
    }
    return;
  }

  // plan.kind === 'trigger-chain' — fire extract-run-audio; the task
  // self-dispatches run-pipeline via extractAlphaAudio({ dispatch: true }).
  try {
    await tasks.trigger('extract-run-audio', {
      runId: payload.runId,
      force: false,
      dispatch: true,
    });
  } catch (err) {
    console.warn(
      '[stripe-webhook] trigger.extract-run-audio failed, falling back in-process ' +
        '(audio must already exist or be extracted manually):',
      err,
    );
    runInProcess(payload);
  }
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
