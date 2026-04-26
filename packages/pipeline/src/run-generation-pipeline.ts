import { and, eq, getDb } from '@creatorcanon/db';
import { project, hub, release } from '@creatorcanon/db/schema';
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

export type RunGenerationPipelineResult =
  | {
      mode: 'legacy_v0';
      runId: string;
      videoCount: number;
      transcriptsFetched: number;
      transcriptsSkipped: number;
      segmentsCreated: number;
      reviewArtifactKey: string;
      draftPageCount: number;
      draftPagesArtifactKey: string;
    }
  | {
      mode: 'editorial_atlas';
      runId: string;
      videoCount: number;
      transcriptsFetched: number;
      transcriptsSkipped: number;
      segmentsCreated: number;
      findingCount: number;
      pageCount: number;
      manifestR2Key: string;
    };

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
    // Phase 0: shared ingestion stages (run for both paths).
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

    // Look up hub for this project to determine the template path.
    const db = getDb();
    const hubRows = await db
      .select({ id: hub.id, templateKey: hub.templateKey })
      .from(hub)
      .where(eq(hub.projectId, payload.projectId))
      .limit(1);
    const hubRow = hubRows[0];
    const templateKey = hubRow?.templateKey ?? 'legacy_v0';

    if (templateKey === 'editorial_atlas') {
      if (!hubRow) {
        throw new Error(
          `Editorial Atlas pipeline requires a hub row for projectId='${payload.projectId}'`,
        );
      }

      // Find or create a release for this run.
      const releaseRows = await db
        .select()
        .from(release)
        .where(and(eq(release.hubId, hubRow.id), eq(release.runId, payload.runId)))
        .limit(1);
      let releaseId = releaseRows[0]?.id;
      if (!releaseId) {
        releaseId = `rel_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        // Determine next releaseNumber for this hub.
        const all = await db
          .select({ n: release.releaseNumber })
          .from(release)
          .where(eq(release.hubId, hubRow.id));
        const nextNumber = (all.reduce((max, r) => Math.max(max, r.n), 0) ?? 0) + 1;
        await db.insert(release).values({
          id: releaseId,
          workspaceId: payload.workspaceId,
          hubId: hubRow.id,
          runId: payload.runId,
          releaseNumber: nextNumber,
          status: 'building',
        });
      }

      // Phase 1: discovery.
      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx,
        stage: 'discovery',
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runDiscoveryStage(i),
      });

      // Phase 2: synthesis.
      await assertWithinRunBudget(payload.runId);
      await runStage({
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
        input: { runId: payload.runId, workspaceId: payload.workspaceId, hubId: hubRow.id, releaseId },
        run: async (i) => runAdaptStage(i),
      });

      await transitionRun(payload.runId, 'awaiting_review', { completedAt: new Date() });

      return {
        mode: 'editorial_atlas',
        runId: payload.runId,
        videoCount: snapshot.videoCount,
        transcriptsFetched: transcriptsResult.fetchedCount,
        transcriptsSkipped: transcriptsResult.skippedCount,
        segmentsCreated: segmentResult.totalSegments,
        findingCount: 0, // queried by callers who need it; leave as 0 for now
        pageCount: merge.pageCount,
        manifestR2Key: adapt.manifestR2Key,
      };
    }

    // Legacy v0 path (preserved byte-for-byte from original).
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
      mode: 'legacy_v0',
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
