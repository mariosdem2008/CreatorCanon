#!/usr/bin/env node
/**
 * One-off backfill: register `video_mp4` mediaAsset rows for manual uploads
 * whose source mp4 is already in R2 but pre-dates the upload-complete handler's
 * automatic insert (Phase 10, Stage 1 v4).
 *
 * Usage:
 *   node scripts/backfill-mediaasset-video-mp4.mjs <videoId> [<videoId> ...]
 * If no IDs are passed, defaults to the two known existing uploads:
 *   mu_9d970d091c38, mu_e0787f2f4a95
 *
 * Reads DATABASE_URL from .env / .env.local in the repo root.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Walk up from this script's location until we find a .env (so the script
// works whether it's run from scripts/, packages/db/, or repo root).
function findRepoRoot(start) {
  let cur = start;
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(resolve(cur, '.env')) || existsSync(resolve(cur, '.env.local'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}
const repoRoot = findRepoRoot(__dirname);

function loadEnv(p, override = false) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!override && process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

loadEnv(resolve(repoRoot, '.env'));
loadEnv(resolve(repoRoot, '.env.local'), true);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Default: workspace + IDs of the two pre-Phase-10 manual uploads.
const DEFAULT_VIDEO_IDS = ['mu_9d970d091c38', 'mu_e0787f2f4a95'];
const videoIds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_VIDEO_IDS;

const sql = postgres(process.env.DATABASE_URL);

let backfilled = 0;
let skipped = 0;
let missing = 0;

try {
  for (const videoId of videoIds) {
    const videoRows = await sql`
      SELECT id, workspace_id, local_r2_key
      FROM video
      WHERE id = ${videoId}
      LIMIT 1
    `;
    const v = videoRows[0];
    if (!v) {
      console.warn(`MISSING video row: ${videoId}`);
      missing += 1;
      continue;
    }
    if (!v.local_r2_key) {
      console.warn(`SKIP ${videoId}: no local_r2_key (not a manual upload?)`);
      skipped += 1;
      continue;
    }

    const exists = await sql`
      SELECT id FROM media_asset
      WHERE video_id = ${videoId} AND type = 'video_mp4'
      LIMIT 1
    `;
    if (exists[0]) {
      console.log(`SKIP ${videoId}: video_mp4 mediaAsset already exists (${exists[0].id})`);
      skipped += 1;
      continue;
    }

    const id = `ma_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await sql`
      INSERT INTO media_asset (id, workspace_id, video_id, type, r2_key)
      VALUES (${id}, ${v.workspace_id}, ${videoId}, 'video_mp4', ${v.local_r2_key})
    `;
    console.log(`BACKFILLED ${videoId} -> ${id} (r2Key=${v.local_r2_key})`);
    backfilled += 1;
  }
} finally {
  await sql.end();
}

console.log(`\nDone. backfilled=${backfilled} skipped=${skipped} missing=${missing}`);
