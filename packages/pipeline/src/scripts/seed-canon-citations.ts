/**
 * Operator one-off: for each canon node lacking valid segmentId citations,
 * re-issue through Codex with the existing payload + the full transcript
 * for the run. Codex returns the same payload structure with `[segmentId]`
 * tokens inserted inline after citable claims.
 *
 * Usage:
 *   tsx ./src/scripts/seed-canon-citations.ts <runId>
 *
 * Idempotent: nodes already containing valid segmentId references are skipped.
 *
 * Trade-off: this script feeds the FULL transcript (all videos) to each
 * Codex call so the model has the complete corpus to choose citations
 * from. ~30K tokens per call · 34 calls ≈ 1M tokens. Free against the
 * ChatGPT plan.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { asc, closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, segment } from '@creatorcanon/db/schema';

import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

async function runCodex(prompt: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cancite-'));
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

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-canon-citations.ts <runId>');

  const db = getDb();
  const segs = await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, text: segment.text })
    .from(segment)
    .where(eq(segment.runId, runId))
    .orderBy(asc(segment.videoId), asc(segment.startMs));
  const segIds = new Set(segs.map((s) => s.id));

  const nodes = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, runId));
  const uuidPat = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  const needsCitation = nodes.filter((n) => {
    const matches = (JSON.stringify(n.payload).match(uuidPat) ?? []).filter((id) => segIds.has(id));
    return matches.length === 0;
  });
  console.info(`[canon-cite] ${needsCitation.length}/${nodes.length} canon nodes need citations`);

  // Build a compact transcript block — one line per segment.
  const segmentBlock = segs.map((s) => `[${s.id}] ${s.text}`).join('\n');

  let updated = 0;
  let skipped = 0;
  for (const n of needsCitation) {
    const prompt = [
      'You are citation_editor. Take a canon node payload and embed [segmentId] citations inline after every citable claim.',
      '',
      '# RULES',
      '- Preserve every field, key, structure, and value EXACTLY as given.',
      '- Insert citation tokens of the form [<segmentId>] inline AFTER each claim that paraphrases or summarizes a transcript segment.',
      '- Use ONLY segmentIds from the transcript block below. NEVER fabricate IDs.',
      '- Each citable claim should have 1-3 segmentId citations.',
      '- Do NOT touch fields that are obviously meta (title, kind, type, score, count fields, ID fields).',
      '- Citable fields include: summary, definition, whyItMatters, whenToUse, whenNotToUse, commonMistake, successSignal, sequencingRationale, examples (each item), steps (each item), failureModes (each item), preconditions (each item), quotes (each item), unifyingThread.',
      '',
      '# TRANSCRIPT (every segment from the run, format `[segmentId] text`)',
      segmentBlock,
      '',
      '# CANON NODE PAYLOAD TO ANNOTATE',
      JSON.stringify(n.payload, null, 2),
      '',
      '# OUTPUT FORMAT — return ONLY the annotated JSON object, same structure, with citations inserted inline. No fences, no commentary.',
    ].join('\n');

    try {
      const raw = await runCodex(prompt);
      let annotated: unknown;
      try {
        const jsonStr = extractJsonFromCodexOutput(raw);
        annotated = JSON.parse(jsonStr);
      } catch (err) {
        console.warn(`[canon-cite] ${n.id}: extract/parse failed; skipping`);
        skipped += 1;
        continue;
      }

      const annotatedJson = JSON.stringify(annotated);
      const matches = (annotatedJson.match(uuidPat) ?? []).filter((id) => segIds.has(id));
      if (matches.length === 0) {
        console.warn(`[canon-cite] ${n.id}: no valid segmentIds embedded; skipping update`);
        skipped += 1;
        continue;
      }

      await db.update(canonNode).set({ payload: annotated as Record<string, unknown> }).where(eq(canonNode.id, n.id));
      updated += 1;
      console.info(`[canon-cite] ${n.id}: ${matches.length} citations embedded (${updated}/${needsCitation.length})`);
    } catch (err) {
      console.warn(`[canon-cite] ${n.id}: error ${(err as Error).message.slice(0, 200)}`);
      skipped += 1;
    }
  }
  console.info(`[canon-cite] DONE — updated ${updated}, skipped ${skipped}`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[canon-cite] FAILED', e); process.exit(1); });
