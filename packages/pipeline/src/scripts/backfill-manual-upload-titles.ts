/**
 * One-shot script to give every manual-upload video with a NULL title a
 * human-readable title. New uploads already get a title from filename via
 * apps/web/src/app/api/upload/init/route.ts; this fills in pre-fix rows.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/backfill-manual-upload-titles.ts            # dry-run
 *   tsx ./src/scripts/backfill-manual-upload-titles.ts --apply    # write changes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, asc, eq, getDb, isNull } from '@creatorcanon/db';
import { segment, video } from '@creatorcanon/db/schema';
import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../transcript/sanitize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '../../../../.env'));

const APPLY = process.argv.includes('--apply');
const TITLE_MAX_CHARS = 80;
const USELESS_FILENAME = /^(source|video|upload|untitled)$/i;

function deriveTitleFromR2Key(localR2Key: string | null): string | null {
  if (!localR2Key) return null;
  // e.g. workspaces/<ws>/uploads/<videoId>/source.mp4 → source
  const filename = localR2Key.split('/').pop() ?? '';
  const stem = filename.replace(/\.[^.]+$/, '').trim();
  if (!stem || USELESS_FILENAME.test(stem)) return null;
  return stem.slice(0, TITLE_MAX_CHARS);
}

function deriveTitleFromOpener(rawText: string): string {
  const cleaned = sanitizeTranscriptText(rawText, DEFAULT_SUBSTITUTIONS).trim();
  const firstSentence = cleaned.split(/[.!?]\s/, 1)[0] ?? cleaned;
  if (firstSentence.length <= TITLE_MAX_CHARS) return firstSentence;
  // Truncate on word boundary, append ellipsis.
  const cut = firstSentence.slice(0, TITLE_MAX_CHARS);
  return cut.replace(/\s+\S*$/, '') + '…';
}

async function main() {
  const db = getDb();

  const targets = await db
    .select({ id: video.id, localR2Key: video.localR2Key, createdAt: video.createdAt })
    .from(video)
    .where(and(eq(video.sourceKind, 'manual_upload'), isNull(video.title)));

  if (targets.length === 0) {
    console.info('[backfill] No manual-upload videos with null title. Done.');
    return;
  }

  console.info(`[backfill] Found ${targets.length} manual-upload video(s) with null title.`);

  for (const v of targets) {
    let derived = deriveTitleFromR2Key(v.localR2Key);

    if (!derived) {
      const firstSeg = await db
        .select({ text: segment.text })
        .from(segment)
        .where(eq(segment.videoId, v.id))
        .orderBy(asc(segment.startMs))
        .limit(1);
      if (firstSeg[0]?.text) {
        derived = deriveTitleFromOpener(firstSeg[0].text);
      }
    }

    if (!derived) {
      const day = (v.createdAt as Date | null)?.toISOString().slice(0, 10) ?? 'unknown-date';
      derived = `Manual upload ${day}`;
    }

    if (!APPLY) {
      console.info(`  [dry-run] ${v.id} → ${JSON.stringify(derived)}`);
      continue;
    }

    await db.update(video).set({ title: derived }).where(eq(video.id, v.id));
    console.info(`  [applied] ${v.id} → ${JSON.stringify(derived)}`);
  }

  if (!APPLY) {
    console.info('[backfill] DRY RUN. Re-run with --apply to write changes.');
  } else {
    console.info('[backfill] Done.');
  }
}

main().catch((err) => {
  console.error('[backfill] failed:', err);
  process.exit(1);
});
