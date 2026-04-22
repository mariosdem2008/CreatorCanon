'use server';

import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  project,
  video,
  videoSet,
  videoSetItem,
  workspaceMember,
} from '@creatorcanon/db/schema';
import { PIPELINE_VERSION, estimateRunPriceCents } from '@creatorcanon/core';
import { getSourceCoverage, preflightSourceCoverage } from '@creatorcanon/pipeline';

const PRESENTATION_PRESETS = new Set(['paper', 'midnight', 'field']);

export async function createProject(formData: FormData): Promise<{ error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated' };

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) return { error: 'No workspace found' };

  const title = (formData.get('title') as string | null)?.trim();
  if (!title) return { error: 'Title is required' };

  const audience = (formData.get('audience') as string | null)?.trim() ?? '';
  const tone = (formData.get('tone') as string | null) ?? 'conversational';
  const lengthPreset = (formData.get('length_preset') as string | null) ?? 'standard';
  const presentationPresetRaw = (formData.get('presentation_preset') as string | null) ?? 'paper';
  const presentationPreset = PRESENTATION_PRESETS.has(presentationPresetRaw)
    ? (presentationPresetRaw as 'paper' | 'midnight' | 'field')
    : 'paper';
  const chatEnabled = formData.get('chat_enabled') === 'true';
  const idsRaw = (formData.get('video_ids') as string | null) ?? '';
  const videoIds = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  if (videoIds.length === 0) return { error: 'Select at least one video' };

  const selectedVideos = await db
    .select({ id: video.id, durationSeconds: video.durationSeconds })
    .from(video)
    .where(inArray(video.id, videoIds));

  if (selectedVideos.length === 0) return { error: 'No valid videos found' };

  const sourceCoverage = await getSourceCoverage({ workspaceId, videoIds });
  const allowLimitedSource = formData.get('allow_limited_source') === 'true';
  if (sourceCoverage.readyCount === 0 && !allowLimitedSource) {
    redirect(`/app/configure?ids=${encodeURIComponent(videoIds.join(','))}&error=source_required`);
  }

  const totalDurationSeconds = selectedVideos.reduce(
    (acc, v) => acc + (v.durationSeconds ?? 0),
    0,
  );

  const videoSetId = crypto.randomUUID();
  await db.insert(videoSet).values({
    id: videoSetId,
    workspaceId,
    name: title,
    createdBy: userId,
    totalDurationSeconds,
    status: 'locked',
  });

  const items = videoIds.map((vid, i) => ({
    id: crypto.randomUUID(),
    videoSetId,
    videoId: vid,
    position: i,
  }));
  await db.insert(videoSetItem).values(items);

  const projectId = crypto.randomUUID();
  await db.insert(project).values({
    id: projectId,
    workspaceId,
    videoSetId,
    title,
    config: {
      audience,
      tone,
      length_preset: lengthPreset as 'short' | 'standard' | 'deep',
      chat_enabled: chatEnabled,
      presentation_preset: presentationPreset,
      source_coverage: {
        selectedCount: sourceCoverage.selectedCount,
        readyCount: sourceCoverage.readyCount,
        unknownCount: sourceCoverage.unknownCount,
        unavailableCount: sourceCoverage.unavailableCount,
        estimatedSourceQuality: sourceCoverage.estimatedSourceQuality,
        allow_limited_source: allowLimitedSource,
      },
    },
  });

  const runId = crypto.randomUUID();
  const configHash = await hashConfig({
    title,
    audience,
    tone,
    lengthPreset,
    presentationPreset,
    chatEnabled,
    videoIds,
  });
  const priceCents = estimateRunPriceCents(totalDurationSeconds);
  await db.insert(generationRun).values({
    id: runId,
    workspaceId,
    projectId,
    videoSetId,
    pipelineVersion: PIPELINE_VERSION,
    configHash,
    status: 'awaiting_payment',
    selectedDurationSeconds: totalDurationSeconds,
    priceCents,
  });

  await db.update(project).set({ currentRunId: runId }).where(eq(project.id, projectId));

  redirect(`/app/checkout?projectId=${projectId}`);
}

export async function checkSourceCoverage(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const idsRaw = (formData.get('video_ids') as string | null) ?? '';
  const videoIds = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (videoIds.length === 0) redirect('/app/library');

  const db = getDb();
  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, session.user.id))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) redirect('/app');

  await preflightSourceCoverage({ workspaceId, videoIds });
  redirect(`/app/configure?ids=${encodeURIComponent(videoIds.join(','))}`);
}

async function hashConfig(config: Record<string, unknown>): Promise<string> {
  const data = JSON.stringify(config, Object.keys(config).sort());
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}
