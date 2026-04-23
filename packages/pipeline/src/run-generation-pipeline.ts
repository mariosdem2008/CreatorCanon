import { and, eq, getDb } from '@creatorcanon/db';
import { project } from '@creatorcanon/db/schema';
import { runStage, transitionRun } from './harness';
import {
  importSelectionSnapshot,
  ensureTranscripts,
  normalizeTranscripts,
  segmentTranscripts,
  synthesizeV0Review,
  draftPagesV0,
  type DraftPagesV0Config,
} from './stages';

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
  reviewArtifactKey: string;
  draftPageCount: number;
  draftPagesArtifactKey: string;
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

    const reviewResult = await runStage({
      ctx,
      stage: 'synthesize_v0_review',
      input: {
        runId: payload.runId,
        workspaceId: payload.workspaceId,
        videos: snapshot.videos,
      },
      run: synthesizeV0Review,
    });

    const db = getDb();
    const projectRows = await db
      .select({ config: project.config })
      .from(project)
      .where(
        and(
          eq(project.id, payload.projectId),
          eq(project.workspaceId, payload.workspaceId),
        ),
      )
      .limit(1);

    const projectConfig = projectRows[0]?.config ?? null;
    const draftConfig: DraftPagesV0Config | null = projectConfig
      ? {
          tone: projectConfig.tone ?? null,
          length_preset: projectConfig.length_preset ?? null,
          audience: projectConfig.audience ?? null,
        }
      : null;

    const draftPagesResult = await runStage({
      ctx,
      stage: 'draft_pages_v0',
      input: {
        runId: payload.runId,
        projectId: payload.projectId,
        workspaceId: payload.workspaceId,
        config: draftConfig,
      },
      run: draftPagesV0,
    });

    await transitionRun(payload.runId, 'awaiting_review', { completedAt: new Date() });

    return {
      runId: payload.runId,
      videoCount: snapshot.videoCount,
      transcriptsFetched: transcriptsResult.fetchedCount,
      transcriptsSkipped: transcriptsResult.skippedCount,
      segmentsCreated: segmentResult.totalSegments,
      reviewArtifactKey: reviewResult.r2Key,
      draftPageCount: draftPagesResult.pageCount,
      draftPagesArtifactKey: draftPagesResult.r2Key,
    };
  } catch (err) {
    await transitionRun(payload.runId, 'failed');
    throw err;
  }
}
