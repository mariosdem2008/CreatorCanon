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
import { assertWithinRunBudget } from './agents/run-budget';

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

    // Require a hub row — the Editorial Atlas pipeline always publishes to a hub.
    const db = getDb();
    const hubRows = await db
      .select({ id: hub.id })
      .from(hub)
      .where(eq(hub.projectId, payload.projectId))
      .limit(1);
    const hubRow = hubRows[0];
    if (!hubRow) {
      throw new Error(
        `Editorial Atlas pipeline requires a hub row for projectId='${payload.projectId}'`,
      );
    }

    // Phase 1: discovery.
    await assertWithinRunBudget(payload.runId);
    const discovery = await runStage({
      ctx,
      stage: 'discovery',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runDiscoveryStage(i),
    });

    // Phase 2: synthesis.
    await assertWithinRunBudget(payload.runId);
    const synthesis = await runStage({
      ctx,
      stage: 'synthesis',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runSynthesisStage(i),
    });

    // Phase 3: verify.
    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'verify',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runVerifyStage(i),
    });

    // Phase 4: merge.
    await assertWithinRunBudget(payload.runId);
    const merge = await runStage({
      ctx,
      stage: 'merge',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runMergeStage(i),
    });

    // Phase 5: adapt.
    await assertWithinRunBudget(payload.runId);
    const adapt = await runStage({
      ctx,
      stage: 'adapt',
      input: { runId: payload.runId, workspaceId: payload.workspaceId, hubId: hubRow.id },
      run: async (i) => runAdaptStage(i),
    });

    await transitionRun(payload.runId, 'awaiting_review', { completedAt: new Date() });

    return {
      runId: payload.runId,
      videoCount: snapshot.videoCount,
      transcriptsFetched: transcriptsResult.fetchedCount,
      transcriptsSkipped: transcriptsResult.skippedCount,
      segmentsCreated: segmentResult.totalSegments,
      findingCount: (discovery.findingCount ?? 0) + (synthesis.findingCount ?? 0),
      pageCount: merge.pageCount,
      manifestR2Key: adapt.manifestR2Key,
    };
  } catch (err) {
    await transitionRun(payload.runId, 'failed');
    throw err;
  }
}
