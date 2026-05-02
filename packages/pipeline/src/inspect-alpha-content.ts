import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { and, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  hub,
  mediaAsset,
  project,
  release,
  segment,
  transcriptAsset,
  video,
  videoSetItem,
} from '@creatorcanon/db/schema';

import {
  ensureTranscriptsStageOutputSchema,
} from './contracts';
import type { CreatorManualManifest } from './adapters/creator-manual/manifest-types';
import { loadDefaultEnvFiles } from './env-files';

function requireRunId(): string {
  const fromArg = process.argv[2]?.trim();
  const fromEnv = process.env.ALPHA_INSPECT_RUN_ID?.trim() || process.env.ALPHA_SMOKE_RUN_ID?.trim();
  const runId = fromArg || fromEnv;
  if (!runId) {
    throw new Error('Pass a run id as the first arg or set ALPHA_INSPECT_RUN_ID.');
  }
  return runId;
}

function toRecordCounts(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function evidenceDensity(sourceRefCount: number, nodeCount: number) {
  if (sourceRefCount <= 0) return 'limited';
  const refsPerNode = sourceRefCount / Math.max(1, nodeCount);
  if (refsPerNode >= 2) return 'strong';
  return 'partial';
}

async function main() {
  loadDefaultEnvFiles();
  const runId = requireRunId();
  const db = getDb();

  const runRows = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      status: generationRun.status,
      projectTitle: project.title,
    })
    .from(generationRun)
    .innerJoin(project, eq(project.id, generationRun.projectId))
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = runRows[0];
  if (!run) throw new Error(`Run ${runId} was not found.`);

  const selectedVideos = await db
    .select({
      id: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      captionStatus: video.captionStatus,
    })
    .from(videoSetItem)
    .innerJoin(video, eq(video.id, videoSetItem.videoId))
    .where(eq(videoSetItem.videoSetId, run.videoSetId));
  const videoIds = selectedVideos.map((item) => item.id);

  const [canonicalTranscripts, audioAssets, segments, liveHubRows, stageRows] = await Promise.all([
    videoIds.length > 0
      ? db
        .select({
          videoId: transcriptAsset.videoId,
          provider: transcriptAsset.provider,
        })
        .from(transcriptAsset)
        .where(and(
          eq(transcriptAsset.workspaceId, run.workspaceId),
          inArray(transcriptAsset.videoId, videoIds),
          eq(transcriptAsset.isCanonical, true),
        ))
      : Promise.resolve([]),
    videoIds.length > 0
      ? db
        .select({
          videoId: mediaAsset.videoId,
          type: mediaAsset.type,
        })
        .from(mediaAsset)
        .where(and(
          eq(mediaAsset.workspaceId, run.workspaceId),
          inArray(mediaAsset.videoId, videoIds),
          eq(mediaAsset.type, 'audio_m4a'),
        ))
      : Promise.resolve([]),
    db
      .select({
        id: segment.id,
        videoId: segment.videoId,
        startMs: segment.startMs,
        endMs: segment.endMs,
      })
      .from(segment)
      .where(eq(segment.runId, run.id)),
    db
      .select({
        hubId: hub.id,
        subdomain: hub.subdomain,
        theme: hub.theme,
        releaseId: release.id,
        releaseNumber: release.releaseNumber,
        manifestR2Key: release.manifestR2Key,
      })
      .from(hub)
      .leftJoin(release, eq(release.id, hub.liveReleaseId))
      .where(and(eq(hub.projectId, run.projectId), eq(hub.workspaceId, run.workspaceId)))
      .limit(1),
    db
      .select({
        stageName: generationStageRun.stageName,
        outputJson: generationStageRun.outputJson,
      })
      .from(generationStageRun)
      .where(eq(generationStageRun.runId, run.id)),
  ]);

  const liveHub = liveHubRows[0];
  let manifestSummary: {
    nodeCount: number;
    sourceCount: number;
    sourceRefCount: number;
    evidenceDensity: string;
  } | null = null;

  if (liveHub?.manifestR2Key) {
    const r2 = createR2Client(parseServerEnv(process.env));
    const manifestObject = await r2.getObject(liveHub.manifestR2Key);
    const raw = JSON.parse(new TextDecoder().decode(manifestObject.body)) as CreatorManualManifest;
    if (raw.schemaVersion !== 'creator_manual_v1') {
      throw new Error(`Expected creator_manual_v1 manifest, got ${raw.schemaVersion}.`);
    }
    const nodeCount = raw.stats?.nodeCount ?? raw.nodes?.length ?? 0;
    const sourceCount = raw.stats?.sourceCount ?? raw.sources?.length ?? 0;
    const evidenceRefCount = raw.nodes?.reduce((sum, node) => sum + node.evidence.length, 0) ?? 0;
    manifestSummary = {
      nodeCount,
      sourceCount,
      sourceRefCount: evidenceRefCount,
      evidenceDensity: evidenceDensity(evidenceRefCount, nodeCount),
    };
  }

  const ensureStage = stageRows.find((row) => row.stageName === 'ensure_transcripts');
  const ensureOutput = ensureStage?.outputJson
    ? ensureTranscriptsStageOutputSchema.safeParse(ensureStage.outputJson)
    : null;

  const segmentDurations = segments.map((item) => item.endMs - item.startMs).filter((value) => value > 0);
  const providerCounts = toRecordCounts(canonicalTranscripts.map((item) => item.provider));
  const captionStatusCounts = toRecordCounts(selectedVideos.map((item) => item.captionStatus));

  console.info(JSON.stringify({
    ok: true,
    run: {
      id: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      projectTitle: run.projectTitle,
      status: run.status,
    },
    selection: {
      videoCount: selectedVideos.length,
      captionStatusCounts,
      videos: selectedVideos,
    },
    transcriptPath: {
      canonicalTranscriptCount: canonicalTranscripts.length,
      canonicalProviders: providerCounts,
      audioAssetVideoCount: audioAssets.length,
      extractionUsed: audioAssets.length > 0,
      transcriptionBacked: canonicalTranscripts.some((item) => item.provider === 'gpt-4o-mini-transcribe'),
      ensureStage: ensureOutput?.success
        ? {
            providerCounts: ensureOutput.data.providerCounts ?? {},
            audioFallback: ensureOutput.data.audioFallback ?? null,
          }
        : null,
    },
    segments: {
      count: segments.length,
      averageDurationMs: segmentDurations.length > 0
        ? Math.round(segmentDurations.reduce((sum, value) => sum + value, 0) / segmentDurations.length)
        : 0,
      shortestDurationMs: segmentDurations.length > 0 ? Math.min(...segmentDurations) : 0,
      longestDurationMs: segmentDurations.length > 0 ? Math.max(...segmentDurations) : 0,
    },
    release: liveHub ? {
      hubId: liveHub.hubId,
      releaseId: liveHub.releaseId,
      releaseNumber: liveHub.releaseNumber,
      publicPath: `/h/${liveHub.subdomain}`,
      theme: liveHub.theme,
      manifestR2Key: liveHub.manifestR2Key,
    } : null,
    content: manifestSummary,
  }, null, 2));
}

main().catch(async (error) => {
  console.error('[inspect-alpha-content] failed', error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDb();
});
