/**
 * Operator one-off: produce a brief for each requested title, when the
 * default brief iterator missed a topical pillar. Each brief comes out
 * with editorialStrategy attached. Useful for closing topical gaps in
 * the catalog (e.g. money/sales/pricing pages on a Hormozi run that
 * skewed toward AI).
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-targeted-briefs.ts <runId> "Brief Title 1" "Brief Title 2" ...
 *
 * Each title gets one Codex call; the prompt includes the channel profile,
 * the full canon graph, the existing brief titles (so the new brief
 * doesn't duplicate one), and instructions to produce exactly one brief
 * with the requested title.
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, channelProfile, generationRun, pageBrief } from '@creatorcanon/db/schema';

import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

async function runCodex(prompt: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tbriefs-'));
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
  const titles = process.argv.slice(3);
  if (!runId || titles.length === 0) {
    throw new Error('Usage: tsx ./src/scripts/seed-targeted-briefs.ts <runId> "Title 1" "Title 2" ...');
  }

  const db = getDb();
  const run = (await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1))[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  const cp = await db.select({ payload: channelProfile.payload }).from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (!cp[0]) throw new Error('No channel profile for this run');
  const profile = cp[0].payload as Record<string, unknown>;

  const canonRows = await db
    .select({ id: canonNode.id, type: canonNode.type, payload: canonNode.payload, pageWorthinessScore: canonNode.pageWorthinessScore })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));

  const existingBriefs = await db
    .select({ payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId));
  const existingTitles = existingBriefs.map((b) => ((b.payload as { pageTitle?: string }).pageTitle ?? '').toLowerCase().trim());
  const existingSlugs = existingBriefs.map((b) => (b.payload as { slug?: string }).slug ?? '').filter(Boolean);

  const canonBlock = canonRows
    .map((n) => `### [${n.id}] ${n.type} · pageWorthiness=${n.pageWorthinessScore}\n${JSON.stringify(n.payload, null, 2)}`)
    .join('\n\n');

  const validIds = new Set(canonRows.map((n) => n.id));

  for (let i = 0; i < titles.length; i += 1) {
    const requestedTitle = titles[i]!.trim();
    if (existingTitles.includes(requestedTitle.toLowerCase())) {
      console.info(`[targeted-briefs] (${i + 1}/${titles.length}) "${requestedTitle}" already exists; skipping`);
      continue;
    }

    const prompt = [
      'You are page_brief_planner. Produce ONE page brief with the EXACT requested title. Pull from the canon list as the page spine.',
      '',
      '# Channel profile',
      JSON.stringify(profile, null, 2),
      '',
      `# Canon nodes (${canonRows.length} total)`,
      canonBlock,
      '',
      `# Existing brief titles (do NOT collide with these)`,
      existingTitles.map((t) => `- ${t}`).join('\n') || '(none)',
      '',
      `# Existing slugs (do NOT collide with these)`,
      existingSlugs.map((s) => `- ${s}`).join('\n') || '(none)',
      '',
      `# REQUIRED TITLE`,
      `"${requestedTitle}"`,
      '',
      '# Instructions',
      `Produce ONE brief whose pageTitle is EXACTLY "${requestedTitle}". Pick the canon nodes that most directly support this title as primaryCanonNodeIds (1-5 nodes), and 0-10 supporting canon node IDs. Include a full editorialStrategy block.`,
      '',
      '# OUTPUT FORMAT',
      'Respond with EXACTLY ONE JSON object — no preamble, no markdown fences, no commentary.',
      '',
      'Schema:',
      '{',
      `  "pageTitle": "${requestedTitle}",`,
      '  "pageType": "topic"|"framework"|"lesson"|"playbook"|"example_collection"|"definition"|"principle",',
      '  "audienceQuestion": "1 sentence — the reader\'s actual question",',
      '  "openingHook": "1 sentence — sticky opening line",',
      '  "slug": "kebab-case-slug",',
      '  "outline": [{ "sectionTitle": "...", "canonNodeIds": ["cn_..."], "intent": "..." }],',
      '  "primaryCanonNodeIds": ["cn_..."],',
      '  "supportingCanonNodeIds": ["cn_..."],',
      '  "pageWorthinessScore": 0-100,',
      '  "position": 0,',
      '  "editorialStrategy": {',
      '    "persona": { "name": "...", "context": "...", "objection": "...", "proofThatHits": "..." },',
      '    "seo": { "primaryKeyword": "...", "intent": "informational|transactional|navigational|commercial", "titleTemplate": "...", "metaDescription": "..." },',
      '    "cta": { "primary": "...", "secondary": "..." },',
      '    "clusterRole": { "tier": "pillar"|"spoke", "parentTopic": "kebab-slug or null", "siblingSlugs": ["..."] },',
      '    "journeyPhase": 1-5,',
      '    "voiceFingerprint": { "profanityAllowed": true|false, "tonePreset": "blunt-tactical"|"warm-coaching"|"analytical-detached", "preserveTerms": ["..."] }',
      '  }',
      '}',
      '',
      'JSON object only. Begin with `{` and end with `}`.',
    ].join('\n');

    console.info(`[targeted-briefs] (${i + 1}/${titles.length}) "${requestedTitle}"`);
    let parsed: Record<string, unknown>;
    try {
      const raw = await runCodex(prompt);
      const json = extractJsonFromCodexOutput(raw);
      parsed = JSON.parse(json);
    } catch (err) {
      console.warn(`[targeted-briefs] "${requestedTitle}" failed: ${(err as Error).message}; continuing`);
      continue;
    }

    const primary = ((parsed.primaryCanonNodeIds as string[] | undefined) ?? []).filter((id) => validIds.has(id));
    const supporting = ((parsed.supportingCanonNodeIds as string[] | undefined) ?? []).filter((id) => validIds.has(id));
    if (primary.length === 0) {
      console.warn(`[targeted-briefs] "${requestedTitle}" dropped — Codex picked no valid primary canon node IDs`);
      continue;
    }

    const payload = { ...parsed, primaryCanonNodeIds: primary, supportingCanonNodeIds: supporting };
    const id = `pb_${crypto.randomUUID().slice(0, 12)}`;
    const position = existingBriefs.length + i + 100;
    await db.insert(pageBrief).values({
      id,
      workspaceId: run.workspaceId,
      runId,
      payload: payload as unknown as Record<string, unknown>,
      pageWorthinessScore: clampScore((parsed as { pageWorthinessScore?: unknown }).pageWorthinessScore),
      position,
    });
    console.info(`[targeted-briefs] "${requestedTitle}" written as ${id} (position ${position})`);
  }

  await closeDb();
  console.info('[targeted-briefs] DONE');
}

main().catch(async (err) => { await closeDb(); console.error('[targeted-briefs] FAILED', err); process.exit(1); });
