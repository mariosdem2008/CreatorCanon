import { eq, inArray } from '@creatorcanon/db';
import { segment, videoIntelligenceCard, transcriptAsset } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import { CANON_LIMITS } from '../canon-limits';
import type { StageContext } from '../harness';

const CONCURRENCY = 3;

export interface VideoIntelligenceStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  r2Override?: R2Client;
}

export interface VideoIntelligenceStageOutput {
  videosAnalyzed: number;
  videosFailed: number;
  costCents: number;
  perVideo: Array<{
    videoId: string;
    ok: boolean;
    summary: RunAgentSummary | null;
    error?: string;
  }>;
}

export async function runVideoIntelligenceStage(
  input: VideoIntelligenceStageInput,
): Promise<VideoIntelligenceStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  // Distinct videoIds with segments in this run.
  const segs = await db
    .selectDistinct({ videoId: segment.videoId })
    .from(segment)
    .where(eq(segment.runId, input.runId));
  const videoIds = segs.map((s) => s.videoId);

  // Run-limit guards. Errors here should redirect users to findings_v1 or trim selection.
  if (videoIds.length < CANON_LIMITS.minSelectedVideos) {
    throw new Error(
      `canon_v1 requires >= ${CANON_LIMITS.minSelectedVideos} videos with segments; found ${videoIds.length}.`,
    );
  }
  if (videoIds.length > CANON_LIMITS.maxSelectedVideos) {
    throw new Error(
      `canon_v1 caps at ${CANON_LIMITS.maxSelectedVideos} videos; this run has ${videoIds.length}. ` +
      `Reduce videoSet or set PIPELINE_CONTENT_ENGINE=findings_v1.`,
    );
  }

  // Transcript-size guard: a single video over 120K chars (~20K words) is rejected
  // before we pay for the agent call.
  const transcripts = await db
    .select({ videoId: transcriptAsset.videoId, wordCount: transcriptAsset.wordCount })
    .from(transcriptAsset)
    .where(inArray(transcriptAsset.videoId, videoIds));
  for (const t of transcripts) {
    const approxChars = (t.wordCount ?? 0) * 6;
    if (approxChars > CANON_LIMITS.maxTranscriptCharsPerVideo) {
      throw new Error(
        `Transcript for ${t.videoId} ~${approxChars} chars exceeds canon_v1 cap of ${CANON_LIMITS.maxTranscriptCharsPerVideo}. ` +
        `Run with findings_v1 or shorten the source.`,
      );
    }
  }

  const cfg = SPECIALISTS.video_analyst;
  const model = selectModel('video_analyst', process.env);

  const results = await runWithConcurrency(videoIds, CONCURRENCY, async (videoId) => {
    // Fresh provider per task — providers are cheap to construct and this avoids
    // any shared-state surprises on retries.
    const provider = makeProvider(model.provider);
    const userMessage =
      `Analyze video ${videoId}. Read getChannelProfile, then ` +
      `getSegmentedTranscript({videoId: '${videoId}'}), then ` +
      `listVisualMoments({videoId: '${videoId}', minScore: 60}). Build the intelligence card.`;
    try {
      const summary = await runAgent({
        runId: input.runId,
        workspaceId: input.workspaceId,
        agent: cfg.agent,
        modelId: model.modelId,
        provider,
        r2,
        tools: cfg.allowedTools,
        systemPrompt: cfg.systemPrompt,
        userMessage,
        caps: cfg.stopOverrides,
      });
      return { videoId, ok: true, summary, error: undefined };
    } catch (err) {
      return { videoId, ok: false, summary: null, error: (err as Error).message };
    }
  });

  return {
    videosAnalyzed: results.filter((r) => r.ok).length,
    videosFailed: results.filter((r) => !r.ok).length,
    costCents: results.reduce((acc, r) => acc + (r.summary?.costCents ?? 0), 0),
    perVideo: results,
  };
}

/**
 * Materialization validator: every video that had segments in the run must
 * have produced exactly one VIC. Cardinality check — the unique index on
 * (run_id, video_id) means duplicates are impossible at the DB level.
 */
export async function validateVideoIntelligenceMaterialization(
  _output: VideoIntelligenceStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const segs = await db
    .selectDistinct({ videoId: segment.videoId })
    .from(segment)
    .where(eq(segment.runId, ctx.runId));
  const cards = await db
    .select({ id: videoIntelligenceCard.id })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, ctx.runId));
  return cards.length === segs.length;
}

async function runWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const out: U[] = [];
  let i = 0;
  await Promise.all(
    Array(Math.min(concurrency, items.length))
      .fill(0)
      .map(async () => {
        while (i < items.length) {
          const idx = i++;
          out[idx] = await fn(items[idx]!);
        }
      }),
  );
  return out;
}
