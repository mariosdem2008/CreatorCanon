import fs from 'node:fs/promises';
import path from 'node:path';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { closeDb, getDb } from '@creatorcanon/db';
import { mediaAsset } from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles, repoRoot } from './env-files';

const DEFAULT_WORKSPACE_ID = 'local-smoke-workspace';
const DEFAULT_VIDEO_IDS = [
  'local-smoke-video-1',
  'local-smoke-video-2',
  'local-smoke-video-3',
];

interface FixtureEntry {
  videoId: string;
  filename: string;
  durationSeconds?: number;
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
      if (typeof candidate.videoId !== 'string' || typeof candidate.filename !== 'string') return null;
      return {
        videoId: candidate.videoId,
        filename: candidate.filename,
        durationSeconds: typeof candidate.durationSeconds === 'number'
          ? candidate.durationSeconds
          : undefined,
      };
    })
    .filter((entry): entry is FixtureEntry => entry != null);
}

async function discoverFixtures(fixtureDir: string): Promise<FixtureEntry[]> {
  const manifest = await loadManifest(fixtureDir);
  if (manifest) return manifest;

  const files = await fs.readdir(fixtureDir).catch(() => []);
  return files
    .filter((file) => file.toLowerCase().endsWith('.m4a'))
    .sort()
    .slice(0, DEFAULT_VIDEO_IDS.length)
    .map((filename, index) => ({
      videoId: DEFAULT_VIDEO_IDS[index]!,
      filename,
    }));
}

async function main() {
  const explicitEnv = {
    artifactStorage: process.env.ARTIFACT_STORAGE,
    localArtifactDir: process.env.LOCAL_ARTIFACT_DIR,
    databaseUrl: process.env.DATABASE_URL,
  };

  loadDefaultEnvFiles();

  if (explicitEnv.artifactStorage) process.env.ARTIFACT_STORAGE = explicitEnv.artifactStorage;
  if (explicitEnv.localArtifactDir) process.env.LOCAL_ARTIFACT_DIR = explicitEnv.localArtifactDir;
  if (explicitEnv.databaseUrl) process.env.DATABASE_URL = explicitEnv.databaseUrl;

  process.env.ARTIFACT_STORAGE ??= 'local';
  process.env.LOCAL_ARTIFACT_DIR ??= '.local/artifacts';
  if (process.env.ARTIFACT_STORAGE === 'local' && !path.isAbsolute(process.env.LOCAL_ARTIFACT_DIR)) {
    process.env.LOCAL_ARTIFACT_DIR = path.resolve(repoRoot, process.env.LOCAL_ARTIFACT_DIR);
  }

  const workspaceId = process.env.AUDIO_FIXTURE_WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID;
  const fixtureDir = path.resolve(repoRoot, process.env.AUDIO_FIXTURE_DIR ?? '.local/audio-fixtures');
  const fixtures = await discoverFixtures(fixtureDir);

  if (fixtures.length === 0) {
    throw new Error(`No .m4a audio fixtures found in ${fixtureDir}.`);
  }

  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const db = getDb();
  const now = new Date();
  const seeded: Array<{ videoId: string; key: string }> = [];

  for (const fixture of fixtures) {
    const filePath = path.resolve(fixtureDir, fixture.filename);
    if (filePath !== fixtureDir && !filePath.startsWith(`${fixtureDir}${path.sep}`)) {
      throw new Error(`Invalid fixture path: ${fixture.filename}`);
    }

    const body = await fs.readFile(filePath);
    const key = `workspaces/${workspaceId}/media/${fixture.videoId}/audio.m4a`;
    await r2.putObject({
      key,
      body,
      contentType: 'audio/mp4',
      metadata: { source: 'local-audio-fixture' },
    });

    await db.insert(mediaAsset).values({
      id: `audio-fixture-${fixture.videoId}`,
      workspaceId,
      videoId: fixture.videoId,
      type: 'audio_m4a',
      r2Key: key,
      durationSeconds: fixture.durationSeconds,
      createdAt: now,
    }).onConflictDoUpdate({
      target: mediaAsset.id,
      set: {
        r2Key: key,
        durationSeconds: fixture.durationSeconds,
      },
    });

    seeded.push({ videoId: fixture.videoId, key });
  }

  await closeDb();
  console.info(JSON.stringify({ ok: true, workspaceId, fixtureDir, seeded }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[seed-audio-fixtures] failed', error);
  process.exit(1);
});
