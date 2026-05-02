import { eq, getDb } from '@creatorcanon/db';
import { hub } from '@creatorcanon/db/schema';
import { runStage, transitionRun } from './harness';
import {
  importSelectionSnapshot,
  ensureTranscripts,
  normalizeTranscripts,
  segmentTranscripts,
} from './stages';
import { runDiscoveryStage } from './stages/discovery';
import { runSynthesisStage } from './stages/synthesis';
import { runVerifyStage } from './stages/verify';
import { runMergeStage } from './stages/merge';
import { runAdaptStage } from './stages/adapt';
import {
  runChannelProfileStage,
  validateChannelProfileMaterialization,
  runVisualContextStage,
  validateVisualContextMaterialization,
  runVideoIntelligenceStage,
  validateVideoIntelligenceMaterialization,
  runCanonStage,
  validateCanonMaterialization,
  runPageBriefsStage,
  validatePageBriefsMaterialization,
  runPageCompositionStage,
  validatePageCompositionMaterialization,
  runPageQualityStage,
  validatePageQualityMaterialization,
} from './stages';
import { assertWithinRunBudget } from './agents/run-budget';

type ContentEngine = 'findings_v1' | 'canon_v1';

function resolveContentEngine(): ContentEngine {
  const raw = process.env.PIPELINE_CONTENT_ENGINE?.trim();
  if (raw === 'canon_v1') return 'canon_v1';
  return 'findings_v1';
}

export interface RunGenerationPipelinePayload {
  runId: string;
  projectId: string;
  workspaceId: string;
  videoSetId: string;
  pipelineVersion: string;
}

export interface RunGenerationPipelineResult {
  runId: string;
  videoCount: number;
  transcriptsFetched: number;
  transcriptsSkipped: number;
  segmentsCreated: number;
  findingCount: number;
  pageCount: number;
  manifestR2Key: string;
}

export async function runGenerationPipeline(
  payload: RunGenerationPipelinePayload,
): Promise<RunGenerationPipelineResult> {
  const ctx = {
    runId: payload.runId,
    workspaceId: payload.workspaceId,
    pipelineVersion: payload.pipelineVersion,
  };

  await transitionRun(payload.runId, 'running', { startedAt: new Date() });

  try {
    // Phase 0: shared ingestion stages.
    const snapshot = await runStage({
      ctx,
      stage: 'import_selection_snapshot',
      input: {
        runId: payload.runId,
        workspaceId: payload.workspaceId,
        videoSetId: payload.videoSetId,
      },
      run: importSelectionSnapshot,
    });

    const transcriptsResult = await runStage({
      ctx,
      stage: 'ensure_transcripts',
      input: {
        runId: payload.runId,
        workspaceId: payload.workspaceId,
        videos: snapshot.videos,
      },
      run: ensureTranscripts,
    });

    const normalizedResult = await runStage({
      ctx,
      stage: 'normalize_transcripts',
      input: {
        runId: payload.runId,
        workspaceId: payload.workspaceId,
        transcripts: transcriptsResult.transcripts,
      },
      run: normalizeTranscripts,
    });

    const segmentResult = await runStage({
      ctx,
      stage: 'segment_transcripts',
      input: {
        runId: payload.runId,
        workspaceId: payload.workspaceId,
        normalizedTranscripts: normalizedResult.normalizedTranscripts,
      },
      run: segmentTranscripts,
    });

    // Require a hub row because the adapt stage writes a hub-specific Creator Manual manifest.
    const db = getDb();
    const hubRows = await db
      .select({ id: hub.id })
      .from(hub)
      .where(eq(hub.projectId, payload.projectId))
      .limit(1);
    const hubRow = hubRows[0];
    if (!hubRow) {
      throw new Error(
        `Creator Manual pipeline requires a hub row for projectId='${payload.projectId}'`,
      );
    }

    const contentEngine = resolveContentEngine();
    let findingCount = 0;
    let pageCount = 0;
    let manifestR2Key = '';

    if (contentEngine === 'canon_v1') {
      // canon_v1: deep-knowledge-extraction engine. Seven stages with
      // materialization validators wired so cache hits revalidate the
      // downstream rows still exist before short-circuiting.
      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx,
        stage: 'channel_profile',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runChannelProfileStage(i),
        validateMaterializedOutput: validateChannelProfileMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx,
        stage: 'visual_context',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runVisualContextStage(i),
        validateMaterializedOutput: validateVisualContextMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      const vic = await runStage({
        ctx,
        stage: 'video_intelligence',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runVideoIntelligenceStage(i),
        validateMaterializedOutput: validateVideoIntelligenceMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      const canon = await runStage({
        ctx,
        stage: 'canon',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runCanonStage(i),
        validateMaterializedOutput: validateCanonMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      const briefs = await runStage({
        ctx,
        stage: 'page_briefs',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageBriefsStage(i),
        validateMaterializedOutput: validatePageBriefsMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      const composition = await runStage({
        ctx,
        stage: 'page_composition',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageCompositionStage(i),
        validateMaterializedOutput: validatePageCompositionMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx,
        stage: 'page_quality',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageQualityStage(i),
        validateMaterializedOutput: validatePageQualityMaterialization,
      });

      // canon_v1 hands its materialized rows to the Creator Manual adapter,
      // which prefers canon_node content when present.
      await assertWithinRunBudget(payload.runId);
      const adapt = await runStage({
        ctx,
        stage: 'adapt',
        input: { runId: payload.runId, workspaceId: payload.workspaceId, hubId: hubRow.id },
        run: async (i) => runAdaptStage(i),
      });

      findingCount = vic.videosAnalyzed + canon.nodeCount + briefs.briefCount;
      pageCount = composition.pageCount;
      manifestR2Key = adapt.manifestR2Key;
    } else {
      // findings_v1: the original 5-phase agentic pipeline (unchanged).
      await assertWithinRunBudget(payload.runId);
      const discovery = await runStage({
        ctx,
        stage: 'discovery',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runDiscoveryStage(i),
      });

      await assertWithinRunBudget(payload.runId);
      const synthesis = await runStage({
        ctx,
        stage: 'synthesis',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runSynthesisStage(i),
      });

      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx,
        stage: 'verify',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runVerifyStage(i),
      });

      await assertWithinRunBudget(payload.runId);
      const merge = await runStage({
        ctx,
        stage: 'merge',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runMergeStage(i),
      });

      await assertWithinRunBudget(payload.runId);
      const adapt = await runStage({
        ctx,
        stage: 'adapt',
        input: { runId: payload.runId, workspaceId: payload.workspaceId, hubId: hubRow.id },
        run: async (i) => runAdaptStage(i),
      });

      findingCount = (discovery.findingCount ?? 0) + (synthesis.findingCount ?? 0);
      pageCount = merge.pageCount;
      manifestR2Key = adapt.manifestR2Key;
    }

    await transitionRun(payload.runId, 'awaiting_review', { completedAt: new Date() });

    return {
      runId: payload.runId,
      videoCount: snapshot.videoCount,
      transcriptsFetched: transcriptsResult.fetchedCount,
      transcriptsSkipped: transcriptsResult.skippedCount,
      segmentsCreated: segmentResult.totalSegments,
      findingCount,
      pageCount,
      manifestR2Key,
    };
  } catch (err) {
    await transitionRun(payload.runId, 'failed');
    throw err;
  }
}
