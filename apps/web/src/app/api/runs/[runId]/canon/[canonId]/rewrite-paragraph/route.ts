import { NextResponse } from 'next/server';
import { auth } from '@creatorcanon/auth';
import { and, eq, getDb } from '@creatorcanon/db';
import { canonNode, generationRun, workspaceMember } from '@creatorcanon/db/schema';
import { runCodex } from '@creatorcanon/pipeline/dev-codex-runner';
import { extractJsonFromCodexOutput } from '@creatorcanon/pipeline/dev-codex-json';
import {
  buildParagraphRewritePrompt,
  paragraphRewriteResponseSchema,
  rewriteParagraphRequestSchema,
  updateCanonPayloadParagraph,
  type CanonPayloadWithManualReview,
} from '@/lib/audit/manual-review-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function codexManualReviewEnabled(): boolean {
  return process.env.PIPELINE_OPENAI_PROVIDER === 'codex_cli' || Boolean(process.env.CODEX_CLI_MODEL);
}

function codexTimeoutMs(): number {
  const raw = Number(process.env.CODEX_CLI_TIMEOUT_MS ?? 600_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000;
}

export async function POST(
  req: Request,
  { params }: { params: { runId: string; canonId: string } },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ReturnType<typeof rewriteParagraphRequestSchema.parse>;
  try {
    body = rewriteParagraphRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!codexManualReviewEnabled()) {
    return NextResponse.json(
      { error: 'Manual paragraph rewrite is enabled only when Codex CLI provider env is configured.' },
      { status: 501 },
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
    .where(and(eq(workspaceMember.workspaceId, run.workspaceId), eq(workspaceMember.userId, session.user.id)))
    .limit(1);
  if (!memberRows[0]) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const canonRows = await db
    .select({ payload: canonNode.payload })
    .from(canonNode)
    .where(and(eq(canonNode.runId, params.runId), eq(canonNode.id, params.canonId)))
    .limit(1);
  const canon = canonRows[0];
  if (!canon) {
    return NextResponse.json({ error: 'Canon not found' }, { status: 404 });
  }

  const payload = (canon.payload ?? {}) as CanonPayloadWithManualReview;
  const prompt = buildParagraphRewritePrompt({
    paragraph: body.paragraph,
    instruction: body.instruction,
    canonTitle: typeof payload.title === 'string' ? payload.title : null,
  });

  let rewrittenParagraph: string;
  try {
    const raw = await runCodex(prompt, {
      timeoutMs: codexTimeoutMs(),
      label: `manual_review_${params.canonId}`,
    });
    const parsed = paragraphRewriteResponseSchema.parse(JSON.parse(extractJsonFromCodexOutput(raw)));
    rewrittenParagraph = parsed.rewrittenParagraph;
  } catch (err) {
    console.error('[manual-review] codex rewrite failed:', err);
    return NextResponse.json({ error: 'Rewrite failed' }, { status: 500 });
  }

  let updatedPayload: CanonPayloadWithManualReview;
  try {
    updatedPayload = updateCanonPayloadParagraph(payload, {
      paragraph: body.paragraph,
      rewrittenParagraph,
      instruction: body.instruction,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }

  await db
    .update(canonNode)
    .set({ payload: updatedPayload })
    .where(and(eq(canonNode.runId, params.runId), eq(canonNode.id, params.canonId)));

  return NextResponse.json({
    rewrittenParagraph,
    body: updatedPayload.body,
    manualReview: updatedPayload._manual_review,
  });
}
