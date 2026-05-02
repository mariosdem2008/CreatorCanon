/**
 * GET /api/runs/[runId]/synthesis
 *
 * Response contract (consumed by Phase B/D — DO NOT change without a coordinated PR):
 *
 *   401 — caller not authenticated
 *   404 — run not found OR caller is not a member of the run's workspace
 *         OR no synthesis has been attempted yet for this run
 *   200 { synthesisRun, bundle: null }
 *         — at least one attempt exists but no successful bundle yet
 *           (status may be 'running' / 'failed'). Polling-friendly.
 *   200 { synthesisRun, bundle }
 *         — bundle ready
 *
 * The 200-with-bundle:null shape is intentional. The plan said "404 if not
 * complete" but a 404-vs-200 split would force callers to maintain two error
 * paths for "still working" and "no run yet." Surfacing the synthesisRun
 * status lets the dashboard render a progress UI from one happy path.
 */

import { NextResponse } from 'next/server';

import { auth } from '@creatorcanon/auth';
import { and, desc, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  productBundle,
  synthesisRun,
  workspaceMember,
} from '@creatorcanon/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { runId: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  // Most recent synthesis_run for this run (any status — we surface state).
  const latestRunRows = await db
    .select({
      id: synthesisRun.id,
      productGoal: synthesisRun.productGoal,
      status: synthesisRun.status,
      startedAt: synthesisRun.startedAt,
      completedAt: synthesisRun.completedAt,
      errorMessage: synthesisRun.errorMessage,
      createdAt: synthesisRun.createdAt,
    })
    .from(synthesisRun)
    .where(eq(synthesisRun.runId, params.runId))
    .orderBy(desc(synthesisRun.createdAt))
    .limit(1);
  const latestSynthesisRun = latestRunRows[0];

  if (!latestSynthesisRun) {
    return NextResponse.json({ error: 'No synthesis runs for this run' }, { status: 404 });
  }

  // Most recent successful product_bundle for this run.
  const bundleRows = await db
    .select({
      id: productBundle.id,
      synthesisRunId: productBundle.synthesisRunId,
      payload: productBundle.payload,
      schemaVersion: productBundle.schemaVersion,
      createdAt: productBundle.createdAt,
    })
    .from(productBundle)
    .where(eq(productBundle.runId, params.runId))
    .orderBy(desc(productBundle.createdAt))
    .limit(1);
  const bundle = bundleRows[0];

  if (!bundle) {
    // Surface synthesis status (e.g. running / failed) without 404 when at
    // least one attempt exists. Caller can poll.
    return NextResponse.json(
      {
        synthesisRun: latestSynthesisRun,
        bundle: null,
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    synthesisRun: latestSynthesisRun,
    bundle: {
      id: bundle.id,
      synthesisRunId: bundle.synthesisRunId,
      schemaVersion: bundle.schemaVersion,
      createdAt: bundle.createdAt,
      payload: bundle.payload,
    },
  });
}
