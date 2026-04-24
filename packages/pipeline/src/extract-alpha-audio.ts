import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  project,
  video,
  videoSetItem,
} from '@creatorcanon/db/schema';

import { extractVideoAudioAssets } from './audio-extraction';
import { loadDefaultEnvFiles } from './env-files';
import {
  runGenerationPipeline,
} from './run-generation-pipeline';

export interface ExtractAlphaAudioInput {
  runId: string;
  force?: boolean;
  dispatch?: boolean;
}

export interface ExtractAlphaAudioResult {
  ok: true;
  runId: string;
  workspaceId: string;
  projectId: string;
  videoCount: number;
  extractedCount: number;
  reusedCount: number;
  dispatched: boolean;
  items: Array<{
    videoId: string;
    youtubeVideoId: string;
    title: string | null;
    transcriptProvider: string | null;
    audioR2Key: string;
    action: 'extracted' | 'reused';
  }>;
}

type SelectedVideo = {
  videoId: string;
  youtubeVideoId: string;
  title: string | null;
};

function parseBooleanFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function requiredRunId(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--run') return args[i + 1]?.trim() ?? '';
    if (arg?.startsWith('--run=')) return arg.slice('--run='.length).trim();
  }
  return process.env.ALPHA_EXTRACT_RUN_ID?.trim() ?? '';
}

async function resolveRunSelection(runId: string): Promise<{
  run: {
    id: string;
    workspaceId: string;
    projectId: string;
    videoSetId: string;
    pipelineVersion: string;
    status: string;
  };
  videos: SelectedVideo[];
}> {
  const db = getDb();
  const runRows = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      pipelineVersion: generationRun.pipelineVersion,
      status: generationRun.status,
      currentProjectId: project.id,
    })
    .from(generationRun)
    .innerJoin(project, eq(project.id, generationRun.projectId))
    .where(eq(generationRun.id, runId))
    .limit(1);

  const run = runRows[0];
  if (!run) throw new Error(`Run ${runId} was not found.`);

  const videoRows = await db
    .select({
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
    })
    .from(videoSetItem)
    .innerJoin(video, eq(video.id, videoSetItem.videoId))
    .where(eq(videoSetItem.videoSetId, run.videoSetId))
    .orderBy(videoSetItem.position);

  if (videoRows.length === 0) {
    throw new Error(`Run ${runId} has no selected videos in its video set.`);
  }

  return {
    run: {
      id: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      videoSetId: run.videoSetId,
      pipelineVersion: run.pipelineVersion,
      status: run.status,
    },
    videos: videoRows,
  };
}

export async function extractAlphaAudio(
  input: ExtractAlphaAudioInput,
): Promise<ExtractAlphaAudioResult> {
  const { run, videos } = await resolveRunSelection(input.runId);
  const extraction = await extractVideoAudioAssets({
    workspaceId: run.workspaceId,
    runId: run.id,
    videos,
    force: input.force,
    requireConfirmation: true,
  });

  let dispatched = false;
  if (input.dispatch) {
    if (run.status === 'awaiting_payment') {
      throw new Error('Cannot dispatch pipeline for an awaiting_payment run.');
    }
    if (run.status === 'published') {
      throw new Error('Cannot dispatch pipeline for a published run.');
    }
    await runGenerationPipeline({
      runId: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      videoSetId: run.videoSetId,
      pipelineVersion: run.pipelineVersion,
    });
    dispatched = true;
  }

  return {
    ok: true,
    runId: run.id,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    videoCount: videos.length,
    extractedCount: extraction.extractedCount,
    reusedCount: extraction.reusedCount,
    dispatched,
    items: extraction.items,
  };
}

async function main() {
  loadDefaultEnvFiles();

  const runId = requiredRunId();
  if (!runId) {
    throw new Error('Pass --run <runId> or set ALPHA_EXTRACT_RUN_ID.');
  }

  const args = process.argv.slice(2);
  const force = args.some((arg) => arg === '--force' || arg === '--force=true')
    || parseBooleanFlag(process.env.ALPHA_AUDIO_EXTRACT_FORCE);
  const dispatch =
    args.some((arg) => arg === '--dispatch' || arg === '--dispatch=true') ||
    parseBooleanFlag(process.env.ALPHA_AUDIO_EXTRACT_DISPATCH);

  const result = await extractAlphaAudio({
    runId,
    force,
    dispatch,
  });
  console.info(JSON.stringify(result, null, 2));
}

const isEntrypoint =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main()
    .catch(async (error) => {
      console.error('[extract-alpha-audio] failed', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDb();
    });
}
