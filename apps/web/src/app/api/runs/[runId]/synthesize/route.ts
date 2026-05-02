/**
 * POST /api/runs/[runId]/synthesize
 *
 * Triggers product synthesis for a generationRun: loads the audit substrate
 * (channel profile + canon nodes), runs the composer pipeline, persists a
 * synthesis_run row + product_bundle row.
 *
 * Phase A scope: synchronous execution. The cohort's per-creator audit
 * substrate is small enough that synthesis fits in a single Lambda timeout
 * window (~30-60s). If/when synthesis exceeds that we'll move to Trigger.dev.
 *
 * Auth: caller must be a member of the run's workspace.
 */

import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@creatorcanon/auth';
import { and, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  productBundle,
  synthesisRun,
  workspaceMember,
} from '@creatorcanon/db/schema';
import { runSynthesis } from '@creatorcanon/synthesis';
import type {
  CanonRef,
  ChannelProfileRef,
  CodexClient,
  CreatorConfig,
  ProductGoal,
} from '@creatorcanon/synthesis';
import { runCodex } from '@creatorcanon/pipeline/dev-codex-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BodySchema = z.object({
  productGoal: z.enum([
    'lead_magnet',
    'paid_product',
    'member_library',
    'sales_asset',
    'public_reference',
  ]),
  creatorConfig: z.object({
    brand: z.object({
      primaryColor: z.string(),
      logoUrl: z.string().optional(),
      logoAlt: z.string().optional(),
    }),
    ctas: z
      .object({
        primary: z.object({ label: z.string(), href: z.string() }).optional(),
        secondary: z.object({ label: z.string(), href: z.string() }).optional(),
      })
      .default({}),
    funnelDestination: z.string().optional(),
    customDomain: z.string().optional(),
  }),
});

function codexTimeoutMs(): number {
  const raw = Number(process.env.CODEX_CLI_TIMEOUT_MS ?? 600_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000;
}

/** Real Codex CLI client backing the runner in production. */
function makeCodexClient(): CodexClient {
  return {
    run: async (prompt, options) => {
      return runCodex(prompt, {
        timeoutMs: options?.timeoutMs ?? codexTimeoutMs(),
        label: options?.label ?? options?.stage ?? 'synthesis',
      });
    },
  };
}

export async function POST(
  req: Request,
  { params }: { params: { runId: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', detail: (err as Error).message },
      { status: 400 },
    );
  }

  const db = getDb();

  const runRows = await db
    .select({ workspaceId: generationRun.workspaceId })
    .from(generationRun)
    .where(eq(generationRun.id, params.runId))
    .limit(1);
  const run = runRows[0];
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const memberRows = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, run.workspaceId),
        eq(workspaceMember.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!memberRows[0]) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  // 1. Insert synthesis_run row.
  const synthesisRunId = randomUUID();
  await db.insert(synthesisRun).values({
    id: synthesisRunId,
    workspaceId: run.workspaceId,
    runId: params.runId,
    productGoal: body.productGoal,
    status: 'running',
    startedAt: new Date(),
  });

  try {
    // 2. Load substrate.
    const profileRows = await db
      .select({ payload: channelProfile.payload })
      .from(channelProfile)
      .where(eq(channelProfile.runId, params.runId))
      .limit(1);
    const profilePayload = profileRows[0]?.payload as Record<string, unknown> | undefined;
    if (!profilePayload) {
      throw new Error('No channel profile found for run');
    }

    const canonRows = await db
      .select({ id: canonNode.id, payload: canonNode.payload })
      .from(canonNode)
      .where(eq(canonNode.runId, params.runId));

    const canons: CanonRef[] = canonRows.map((row) => ({
      id: row.id,
      payload: (row.payload ?? {}) as CanonRef['payload'],
    }));

    // 3. Run synthesis.
    const bundle = await runSynthesis({
      runId: params.runId,
      productGoal: body.productGoal as ProductGoal,
      creatorConfig: body.creatorConfig as CreatorConfig,
      channelProfile: profilePayload as ChannelProfileRef,
      canons,
      codex: makeCodexClient(),
    });

    // 4. Persist product_bundle.
    const bundleId = randomUUID();
    await db.insert(productBundle).values({
      id: bundleId,
      synthesisRunId,
      workspaceId: run.workspaceId,
      runId: params.runId,
      payload: bundle,
      schemaVersion: bundle.schemaVersion,
    });

    // 5. Mark synthesis_run succeeded.
    await db
      .update(synthesisRun)
      .set({ status: 'succeeded', completedAt: new Date() })
      .where(eq(synthesisRun.id, synthesisRunId));

    return NextResponse.json({
      synthesisRunId,
      productBundleId: bundleId,
      status: 'succeeded',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[synthesize] failed:', err);
    await db
      .update(synthesisRun)
      .set({ status: 'failed', completedAt: new Date(), errorMessage: message })
      .where(eq(synthesisRun.id, synthesisRunId));
    return NextResponse.json(
      { synthesisRunId, status: 'failed', error: message },
      { status: 500 },
    );
  }
}
