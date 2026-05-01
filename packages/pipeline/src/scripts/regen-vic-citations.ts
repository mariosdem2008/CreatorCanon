/**
 * Operator one-off: regenerate VICs whose original generation predates
 * the segmentId-first citation prompt fix (commit 1376f01). For each
 * target videoId, fetch segments + visual moments, build the
 * segmentId-first prompt, run Codex, replace the existing VIC payload.
 *
 * Usage:
 *   tsx ./src/scripts/regen-vic-citations.ts <runId> <videoId> [<videoId>...]
 *
 * Idempotent: re-running just rewrites the payload column.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { and, asc, closeDb, eq, getDb } from '@creatorcanon/db';
import {
  channelProfile,
  segment,
  video,
  videoIntelligenceCard,
  visualMoment,
} from '@creatorcanon/db/schema';

import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_TIMEOUT_MS = 10 * 60 * 1000;

async function runCodex(prompt: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-vicregen-'));
  const tmpFile = path.join(tmpDir, 'out.txt');
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (cb: () => void) => {
      if (settled) return;
      settled = true;
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ }
      cb();
    };
    const proc = spawn(
      CODEX_BINARY,
      ['exec', '--skip-git-repo-check', '-o', tmpFile],
      { stdio: ['pipe', 'ignore', 'pipe'], env: process.env, shell: process.platform === 'win32' },
    );
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    if (proc.stdin) {
      proc.stdin.on('error', () => { /* EPIPE non-fatal */ });
      proc.stdin.write(prompt);
      proc.stdin.end();
    }
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* */ }
      settle(() => reject(new Error('codex timed out')));
    }, CODEX_TIMEOUT_MS);
    proc.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(new Error(`codex spawn failed: ${err.message}`)));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`)));
        return;
      }
      let content: string;
      try { content = fs.readFileSync(tmpFile, 'utf8'); }
      catch (e) { settle(() => reject(new Error(`read tmpFile failed: ${(e as Error).message}`))); return; }
      settle(() => resolve(content));
    });
  });
}

async function regenForVideo(runId: string, videoId: string, profile: unknown): Promise<void> {
  const db = getDb();
  const v = await db.select().from(video).where(eq(video.id, videoId)).limit(1);
  if (!v[0]) {
    console.warn(`[vic-regen] ${videoId}: video row not found; skipping`);
    return;
  }

  const segs = await db
    .select({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs, text: segment.text })
    .from(segment)
    .where(and(eq(segment.runId, runId), eq(segment.videoId, videoId)))
    .orderBy(asc(segment.startMs));

  const moments = await db
    .select({
      id: visualMoment.id,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
      hubUse: visualMoment.hubUse,
    })
    .from(visualMoment)
    .where(and(eq(visualMoment.runId, runId), eq(visualMoment.videoId, videoId)));

  const segmentBlock = segs.map((s) => `[${s.id}] ${s.startMs}ms-${s.endMs}ms: ${s.text}`).join('\n');
  const visualBlock = moments.length > 0
    ? moments.map((m) => `[${m.id}] ${m.timestampMs}ms ${m.type}: ${m.description} (hubUse: ${m.hubUse})`).join('\n')
    : '(no visual moments)';

  const durationMin = Math.round((v[0].durationSeconds ?? 0) / 60);
  const prompt = [
    'You are video_analyst. Produce a citation-grade intelligence card for ONE video.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Video: ${v[0].title ?? '(untitled)'} (${durationMin} min)`,
    '',
    `# Transcript (${segs.length} segments)`,
    segmentBlock,
    '',
    `# Visual moments (${moments.length})`,
    visualBlock,
    '',
    '# CITATION FORMAT',
    'When citing transcript evidence inline in main ideas, lessons, examples, stories, mistakes, claims, or contrarian takes, prefer the format `[<segmentId>]` (the segment\'s UUID, exactly as shown in the transcript block above) so the markdown export can render it as a clickable YouTube timestamp. AVOID `[<startMs>ms-<endMs>ms]` ranges — they cannot be linkified back to a YouTube URL because they lack the videoId binding. If you genuinely need a time range, use `[m:ss-m:ss]` format (just the time, no IDs).',
    '',
    '# OUTPUT FORMAT — return ONLY the JSON object, no fences, no commentary. Schema:',
    '{',
    '  "mainIdeas": string[] (3-8),',
    '  "frameworks": [{"name":string,"steps":string[],"whenToUse":string}] (0-5),',
    '  "lessons": string[] (2-8),',
    '  "examples": string[] (0-6),',
    '  "stories": string[] (0-4),',
    '  "mistakesToAvoid": [{"mistake":string,"why":string,"correction":string}] (2-6),',
    '  "failureModes": string[] (0-4),',
    '  "counterCases": string[] (0-4),',
    '  "toolsMentioned": string[] (0-12),',
    '  "termsDefined": [{"term":string,"definition":string}] (0-8),',
    '  "strongClaims": string[] (0-8),',
    '  "contrarianTakes": string[] (0-5),',
    '  "quotes": string[] (3-8, 10-280 chars each, stand-alone, verbatim from transcript),',
    '  "recommendedHubUses": string[] (2-6),',
    '  "creatorVoiceNotes": string[] (up to 6, the way this creator talks)',
    '}',
    '',
    'Drop weak items. Use the creator\'s words from the transcript. JSON only.',
  ].join('\n');

  console.info(`[vic-regen] ${videoId}: generating…`);
  const raw = await runCodex(prompt);
  let newPayload: unknown;
  try {
    const jsonStr = extractJsonFromCodexOutput(raw);
    newPayload = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`extract/parse failed: ${(err as Error).message.slice(0, 200)}`);
  }

  await db
    .update(videoIntelligenceCard)
    .set({ payload: newPayload as Record<string, unknown> })
    .where(and(eq(videoIntelligenceCard.runId, runId), eq(videoIntelligenceCard.videoId, videoId)));
  console.info(`[vic-regen] ${videoId}: payload replaced`);
}

async function main() {
  const runId = process.argv[2];
  const videoIds = process.argv.slice(3);
  if (!runId || videoIds.length === 0) {
    throw new Error('Usage: tsx ./src/scripts/regen-vic-citations.ts <runId> <videoId> [<videoId>...]');
  }

  const db = getDb();
  const cp = await db.select().from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (!cp[0]) throw new Error('No channel profile for run');

  for (const vid of videoIds) {
    try {
      await regenForVideo(runId, vid, cp[0].payload);
    } catch (err) {
      console.error(`[vic-regen] ${vid} FAILED: ${(err as Error).message}`);
    }
  }
  console.info('[vic-regen] DONE');
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[vic-regen] FAILED', e); process.exit(1); });
