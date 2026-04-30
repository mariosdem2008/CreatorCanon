/**
 * Operator one-off: produce a single canon node for a specifically named
 * framework when the canon iterator missed it. Mirror of seed-targeted-briefs
 * but at the canon layer.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-targeted-canon.ts <runId> <videoId> "Framework Title"
 *
 * The <videoId> is the source video where the framework was originally named
 * in the VIC. The script feeds Codex that ONE VIC + the channel profile +
 * the requested framework title, and gets back a canon node JSON.
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { and, closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, channelProfile, generationRun, videoIntelligenceCard } from '@creatorcanon/db/schema';

import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

async function runCodex(prompt: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tcanon-'));
  const tmpFile = path.join(tmpDir, 'out.txt');
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (cb: () => void) => { if (settled) return; settled = true; try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* */ } cb(); };
    const proc = spawn(CODEX_BINARY, ['exec', '--skip-git-repo-check', '-o', tmpFile], { stdio: ['pipe', 'ignore', 'pipe'], env: process.env, shell: process.platform === 'win32' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    if (proc.stdin) { proc.stdin.on('error', () => { /* EPIPE non-fatal */ }); proc.stdin.write(prompt); proc.stdin.end(); }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* */ } settle(() => reject(new Error(`codex timed out after ${CODEX_TIMEOUT_MS}ms`))); }, CODEX_TIMEOUT_MS);
    proc.on('error', (err) => { clearTimeout(timer); settle(() => reject(new Error(`codex spawn failed: ${err.message}`))); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`)));
        return;
      }
      // Read BEFORE settle. Settle deletes tmpDir, so reading inside the
      // settle callback throws ENOENT and orphans the promise.
      let content: string;
      try {
        content = fs.readFileSync(tmpFile, 'utf8');
      } catch (e) {
        settle(() => reject(new Error(`output unreadable: ${(e as Error).message}`)));
        return;
      }
      settle(() => resolve(content));
    });
  });
}

function clampScore(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function main() {
  const runId = process.argv[2];
  const videoId = process.argv[3];
  const title = process.argv[4];
  if (!runId || !videoId || !title) {
    throw new Error('Usage: tsx ./src/scripts/seed-targeted-canon.ts <runId> <videoId> "Framework Title"');
  }

  const db = getDb();
  const run = (await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1))[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  const cp = await db.select({ payload: channelProfile.payload }).from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (!cp[0]) throw new Error('No channel profile');
  const profile = cp[0].payload as Record<string, unknown>;

  const vic = await db.select({ payload: videoIntelligenceCard.payload, evidenceSegmentIds: videoIntelligenceCard.evidenceSegmentIds }).from(videoIntelligenceCard).where(and(eq(videoIntelligenceCard.runId, runId), eq(videoIntelligenceCard.videoId, videoId))).limit(1);
  if (!vic[0]) throw new Error(`No VIC for runId=${runId} videoId=${videoId}`);

  const prompt = [
    'You are canon_architect. Produce ONE canon node for the named framework, drawn from the supplied VIC.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Source VIC (videoId=${videoId})`,
    JSON.stringify(vic[0].payload, null, 2),
    '',
    `# REQUIRED FRAMEWORK TITLE`,
    `"${title}"`,
    '',
    '# Instructions',
    `Produce ONE canon node whose payload.title is EXACTLY "${title}". Use the source VIC's frameworks/lessons as evidence. Set sourceVideoIds to ["${videoId}"] and origin to "single_video".`,
    '',
    '# OUTPUT FORMAT',
    'Respond with EXACTLY ONE JSON object — no preamble, no markdown fences.',
    '',
    'Schema:',
    '{',
    '  "type": "framework"|"playbook"|"lesson"|"principle"|"pattern"|"tactic"|"definition"|"aha_moment"|"quote"|"topic"|"example",',
    '  "payload": { "title": "...", "summary": "...", "whenToUse": "...", "whenNotToUse": null|"...", "commonMistake": null|"...", "successSignal": "...", "preconditions": [], "steps": [], "sequencingRationale": null|"...", "failureModes": [], "examples": [], "definition": null|"..." },',
    `  "sourceVideoIds": ["${videoId}"],`,
    '  "origin": "single_video",',
    '  "confidenceScore": 0-100, "pageWorthinessScore": 0-100, "specificityScore": 0-100, "creatorUniquenessScore": 0-100,',
    '  "evidenceQuality": "high"|"medium"|"low"',
    '}',
  ].join('\n');

  console.info(`[targeted-canon] generating "${title}" for ${videoId}…`);
  const raw = await runCodex(prompt);
  const json = extractJsonFromCodexOutput(raw);
  const node = JSON.parse(json) as {
    type: string;
    payload: Record<string, unknown>;
    sourceVideoIds: string[];
    origin: string;
    confidenceScore: number; pageWorthinessScore: number; specificityScore: number; creatorUniquenessScore: number;
    evidenceQuality: string;
  };

  const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
  await db.insert(canonNode).values({
    id,
    workspaceId: run.workspaceId,
    runId,
    type: node.type,
    payload: node.payload,
    evidenceSegmentIds: vic[0].evidenceSegmentIds ?? [],
    sourceVideoIds: node.sourceVideoIds,
    evidenceQuality: node.evidenceQuality as 'high' | 'medium' | 'low',
    origin: node.origin,
    confidenceScore: clampScore(node.confidenceScore),
    pageWorthinessScore: clampScore(node.pageWorthinessScore),
    specificityScore: clampScore(node.specificityScore),
    creatorUniquenessScore: clampScore(node.creatorUniquenessScore),
    citationCount: (vic[0].evidenceSegmentIds ?? []).length,
    sourceCoverage: 1,
  });
  console.info(`[targeted-canon] "${title}" written as ${id}`);

  await closeDb();
}

main().catch(async (err) => { await closeDb(); console.error('[targeted-canon] FAILED', err); process.exit(1); });
