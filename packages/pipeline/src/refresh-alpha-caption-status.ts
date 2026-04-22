/**
 * Operator-only: re-read contentDetails.caption for every existing video
 * in the target alpha workspace and update caption_status. Also runs a
 * captions.list follow-up to mark auto_only where only ASR tracks exist.
 *
 * Uses the workspace owner's stored Google OAuth token — must already
 * carry `youtube.readonly` at minimum. Doesn't require force-ssl (that
 * scope is only needed for captions.download, which runs during the
 * pipeline, not here).
 *
 * Env:
 *   ALPHA_AUDIO_WORKSPACE_ID   target workspace (required)
 *   ALPHA_AUDIO_SEED_CONFIRM   set to 'true' if ARTIFACT_STORAGE=local
 */

import { createYouTubeClient } from '@creatorcanon/adapters';
import { and, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import { account, video, workspace } from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from './env-files';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required.`);
  return v;
}

async function main() {
  loadDefaultEnvFiles();

  const isLocalMode =
    process.env.ARTIFACT_STORAGE === 'local' ||
    process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
  if (isLocalMode && process.env.ALPHA_AUDIO_SEED_CONFIRM !== 'true') {
    throw new Error('Refusing to run in local-smoke mode. Set ALPHA_AUDIO_SEED_CONFIRM=true to override.');
  }

  const workspaceId = requireEnv('ALPHA_AUDIO_WORKSPACE_ID');
  const db = getDb();

  const ownerRows = await db
    .select({
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
      expiresAt: account.expires_at,
      scope: account.scope,
    })
    .from(account)
    .innerJoin(workspace, eq(workspace.ownerUserId, account.userId))
    .where(and(eq(workspace.id, workspaceId), eq(account.provider, 'google')))
    .limit(1);
  const owner = ownerRows[0];
  if (!owner?.accessToken) {
    throw new Error('Workspace owner has no Google account / access_token.');
  }

  const videos = await db
    .select({ id: video.id, youtubeVideoId: video.youtubeVideoId })
    .from(video)
    .where(eq(video.workspaceId, workspaceId));

  // Filter out our synthetic alpha-audio-* seed IDs (not real YouTube videos)
  const realVideos = videos.filter((v) => v.youtubeVideoId && !v.youtubeVideoId.startsWith('alpha-audio-'));
  if (realVideos.length === 0) {
    console.info(JSON.stringify({ ok: true, workspaceId, note: 'No real YouTube videos in workspace.' }));
    await closeDb();
    return;
  }

  const client = createYouTubeClient({
    accessToken: owner.accessToken,
    refreshToken: owner.refreshToken ?? undefined,
    expiresAt: owner.expiresAt ? owner.expiresAt * 1000 : undefined,
    scope: owner.scope ?? undefined,
  });

  const details = await client.getVideoDetails(realVideos.map((v) => v.youtubeVideoId));
  const detailMap = new Map(details.map((d) => [d.id, d]));

  const updates: Array<{ videoId: string; youtubeVideoId: string; before: string; after: 'available' | 'auto_only' | 'none' | 'unknown'; tracks: number }> = [];

  for (const v of realVideos) {
    const detail = detailMap.get(v.youtubeVideoId);
    const captionEnabled = detail?.captionEnabled;
    let status: 'available' | 'auto_only' | 'none' | 'unknown';

    if (captionEnabled === false) {
      status = 'none';
    } else if (captionEnabled === true) {
      // Look at captions.list to distinguish manual vs auto-only
      try {
        const tracks = await client.getCaptions(v.youtubeVideoId);
        const usable = tracks.filter((t) => !t.isDraft);
        const hasManual = usable.some((t) => !t.isAuto);
        status = hasManual ? 'available' : usable.length > 0 ? 'auto_only' : 'none';
        updates.push({ videoId: v.id, youtubeVideoId: v.youtubeVideoId, before: '', after: status, tracks: usable.length });
      } catch {
        status = 'available'; // contentDetails says enabled; be optimistic
      }
    } else {
      status = 'unknown';
    }

    if (!updates.find((u) => u.videoId === v.id)) {
      updates.push({ videoId: v.id, youtubeVideoId: v.youtubeVideoId, before: '', after: status, tracks: 0 });
    }

    await db.update(video).set({ captionStatus: status, updatedAt: new Date() }).where(eq(video.id, v.id));
  }

  await closeDb();
  console.info(JSON.stringify({ ok: true, workspaceId, updated: updates }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[refresh-alpha-caption-status] failed', error);
  process.exit(1);
});
