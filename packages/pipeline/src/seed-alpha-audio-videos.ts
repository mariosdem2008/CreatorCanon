/**
 * Operator-only: seed 1–N audio-backed videos into an alpha workspace so the
 * creator flow can produce a source-positive published hub without depending
 * on YouTube caption availability.
 *
 * For each .m4a fixture discovered (manifest.json or directory glob):
 *   1. Upload to real R2 at workspaces/{wid}/media/{videoId}/audio.m4a
 *   2. Insert a synthetic `video` row (caption_status='none', synthetic
 *      youtube_video_id, title prefixed with [ALPHA AUDIO SMOKE]) attached
 *      to the workspace's existing channel
 *   3. Insert a `media_asset` row with type='audio_m4a' pointing at the R2 key
 *   4. Do NOT seed any transcript — the pipeline must prove transcription
 *      end-to-end (audio_m4a → OpenAI gpt-4o-mini-transcribe → canonical
 *      transcript → normalize → segment → source refs).
 *
 * The script refuses to run in local-smoke mode (ARTIFACT_STORAGE=local or
 * DEV_AUTH_BYPASS_ENABLED=true) unless ALPHA_AUDIO_SEED_CONFIRM=true.
 * The target workspace is read from ALPHA_AUDIO_WORKSPACE_ID, which must be
 * an existing workspace with at least one connected channel.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { and, closeDb, eq, getDb } from '@creatorcanon/db';
import { channel, mediaAsset, video } from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from './env-files';

interface FixtureEntry {
  filename: string;
  durationSeconds?: number;
}

function repoRoot(): string {
  return path.resolve(process.cwd(), '../..');
}

async function pathExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}

async function loadManifest(fixtureDir: string): Promise<FixtureEntry[] | null> {
  const manifestPath = path.join(fixtureDir, 'manifest.json');
  if (!(await pathExists(manifestPath))) return null;

  const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as unknown;
  const entries = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw != null && Array.isArray((raw as { fixtures?: unknown }).fixtures)
      ? (raw as { fixtures: unknown[] }).fixtures
      : [];

  return entries
    .map((entry): FixtureEntry | null => {
      if (typeof entry !== 'object' || entry == null) return null;
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.filename !== 'string') return null;
      return {
        filename: candidate.filename,
        durationSeconds:
          typeof candidate.durationSeconds === 'number' ? candidate.durationSeconds : undefined,
      };
    })
    .filter((entry): entry is FixtureEntry => entry != null);
}

async function discoverFixtures(fixtureDir: string): Promise<FixtureEntry[]> {
  const manifest = await loadManifest(fixtureDir);
  if (manifest && manifest.length > 0) return manifest;

  const files = await fs.readdir(fixtureDir).catch(() => []);
  return files
    .filter((file) => file.toLowerCase().endsWith('.m4a'))
    .sort()
    .map<FixtureEntry>((filename) => ({ filename }));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  loadDefaultEnvFiles();

  const isLocalMode =
    process.env.ARTIFACT_STORAGE === 'local' ||
    process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
  if (isLocalMode && process.env.ALPHA_AUDIO_SEED_CONFIRM !== 'true') {
    throw new Error(
      'Refusing to run in local-smoke mode. Set ALPHA_AUDIO_SEED_CONFIRM=true to override.',
    );
  }

  const workspaceId = requireEnv('ALPHA_AUDIO_WORKSPACE_ID');
  const fixtureDir = path.resolve(
    repoRoot(),
    process.env.AUDIO_FIXTURE_DIR ?? '.local/audio-fixtures',
  );
  const fixtures = await discoverFixtures(fixtureDir);
  if (fixtures.length === 0) {
    throw new Error(`No .m4a audio fixtures found in ${fixtureDir}.`);
  }

  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const db = getDb();

  // Find or use provided channel id
  const explicitChannelId = process.env.ALPHA_AUDIO_CHANNEL_ID?.trim();
  let channelId: string;
  if (explicitChannelId) {
    const rows = await db
      .select({ id: channel.id })
      .from(channel)
      .where(and(eq(channel.id, explicitChannelId), eq(channel.workspaceId, workspaceId)))
      .limit(1);
    const match = rows[0];
    if (!match) {
      throw new Error(
        `Channel ${explicitChannelId} not found in workspace ${workspaceId}.`,
      );
    }
    channelId = match.id;
  } else {
    const rows = await db
      .select({ id: channel.id, title: channel.title })
      .from(channel)
      .where(eq(channel.workspaceId, workspaceId))
      .limit(1);
    if (!rows[0]) {
      throw new Error(
        `Workspace ${workspaceId} has no channel; connect YouTube first or pass ALPHA_AUDIO_CHANNEL_ID.`,
      );
    }
    channelId = rows[0].id;
  }

  const now = new Date();
  const publishedAt = new Date('2026-04-22T00:00:00.000Z');
  const seeded: Array<{
    videoId: string;
    filename: string;
    title: string;
    audioR2Key: string;
    durationSeconds: number | null;
  }> = [];

  for (const fixture of fixtures) {
    const filePath = path.resolve(fixtureDir, fixture.filename);
    if (filePath !== fixtureDir && !filePath.startsWith(`${fixtureDir}${path.sep}`)) {
      throw new Error(`Invalid fixture path: ${fixture.filename}`);
    }
    const body = await fs.readFile(filePath);

    const videoId = `alpha-audio-${crypto.randomUUID()}`;
    const title = `[ALPHA AUDIO SMOKE] ${fixture.filename}`;
    const audioKey = `workspaces/${workspaceId}/media/${videoId}/audio.m4a`;
    const durationSeconds = fixture.durationSeconds ?? null;

    await r2.putObject({
      key: audioKey,
      body,
      contentType: 'audio/mp4',
      metadata: { source: 'alpha-audio-smoke' },
    });

    await db
      .insert(video)
      .values({
        id: videoId,
        workspaceId,
        channelId,
        youtubeVideoId: videoId,
        title,
        description: 'Operator-seeded audio fixture for alpha transcription proof.',
        publishedAt,
        durationSeconds: durationSeconds ?? 30,
        viewCount: 0,
        captionStatus: 'none',
        metadataFetchedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    await db
      .insert(mediaAsset)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        videoId,
        type: 'audio_m4a',
        r2Key: audioKey,
        durationSeconds: durationSeconds ?? undefined,
        createdAt: now,
      })
      .onConflictDoNothing();

    seeded.push({ videoId, filename: fixture.filename, title, audioR2Key: audioKey, durationSeconds });
  }

  await closeDb();
  console.info(
    JSON.stringify(
      {
        ok: true,
        workspaceId,
        channelId,
        fixtureDir,
        videoIds: seeded.map((s) => s.videoId),
        seeded,
      },
      null,
      2,
    ),
  );
}

main().catch(async (error) => {
  await closeDb();
  console.error('[seed-alpha-audio-videos] failed', error);
  process.exit(1);
});
