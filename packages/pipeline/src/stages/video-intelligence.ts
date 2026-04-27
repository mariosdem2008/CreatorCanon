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

  // Transcript-size guard: skip per-video when oversized (do NOT abort the
  // whole stage). 5.5 chars/word = English avg + space; * 6 was 10-20% high.
  const transcripts = await db
    .select({ videoId: transcriptAsset.videoId, wordCount: transcriptAsset.wordCount })
    .from(transcriptAsset)
    .where(inArray(transcriptAsset.videoId, videoIds));
  const oversized = new Map<string, number>(); // videoId -> approxChars
  for (const t of transcripts) {
    const approxChars = Math.round((t.wordCount ?? 0) * 5.5);
    if (approxChars > CANON_LIMITS.maxTranscriptCharsPerVideo) {
      oversized.set(t.videoId, approxChars);
    }
  }
  const eligibleVideoIds = videoIds.filter((id) => !oversized.has(id));
  if (eligibleVideoIds.length === 0) {
    throw new Error(
      `All ${videoIds.length} videos exceed canon_v1 transcript cap of ${CANON_LIMITS.maxTranscriptCharsPerVideo} chars. ` +
        `Run with findings_v1 or shorten the sources.`,
    );
  }

  const cfg = SPECIALISTS.video_analyst;
  const model = selectModel('video_analyst', process.env);

  // Pre-populate oversized-video failures so the run-result reflects them.
  const oversizedResults: Array<{
    videoId: string;
    ok: boolean;
    summary: null;
    error: string;
  }> = [...oversized.entries()].map(([videoId, approxChars]) => ({
    videoId,
    ok: false,
    summary: null,
    error: `Transcript ~${approxChars} chars exceeds canon_v1 cap of ${CANON_LIMITS.maxTranscriptCharsPerVideo}; skipped.`,
  }));

  const results = await runWithConcurrency(eligibleVideoIds, CONCURRENCY, async (videoId) => {
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

  const allResults = [...oversizedResults, ...results];
  return {
    videosAnalyzed: allResults.filter((r) => r.ok).length,
    videosFailed: allResults.filter((r) => !r.ok).length,
    costCents: allResults.reduce((acc, r) => acc + (r.summary?.costCents ?? 0), 0),
    perVideo: allResults,
  };
}

/**
 * Materialization validator. The cached output.videosAnalyzed is the
 * authoritative count of cards we expected to land — not segs.length, which
 * would over-demand when some videos legitimately failed (oversized
 * transcripts, agent errors). The unique index on (run_id, video_id) means
 * duplicates are impossible at the DB level, so cards.length >= analyzed
 * is the right comparison.
 */
export async function validateVideoIntelligenceMaterialization(
  output: VideoIntelligenceStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  if (output.videosAnalyzed === 0) return true;
  const db = getDb();
  const cards = await db
    .select({ id: videoIntelligenceCard.id })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, ctx.runId));
  return cards.length >= output.videosAnalyzed;
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
