/**
 * Operator one-off: for each page_brief, generate an editorial strategy
 * block (persona, SEO, CTA, cluster role, journey phase, voice fingerprint)
 * via Codex CLI. Mutates each page_brief.payload to include an
 * `editorialStrategy` field. Idempotent — briefs that already have an
 * editorialStrategy block are skipped.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-editorial-strategy.ts <runId>
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { canonNode, channelProfile, generationRun, pageBrief } from '@creatorcanon/db/schema';
import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

async function runCodex(prompt: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-edstrat-'));
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
        settle(() => reject(new Error(`output not readable: ${(e as Error).message}`)));
        return;
      }
      settle(() => resolve(content));
    });
  });
}

interface EditorialStrategy {
  persona: { name: string; context: string; objection: string; proofThatHits: string };
  seo: { primaryKeyword: string; intent: 'informational' | 'transactional' | 'navigational' | 'commercial'; titleTemplate: string; metaDescription: string };
  cta: { primary: string; secondary: string };
  clusterRole: { tier: 'pillar' | 'spoke'; parentTopic: string | null; siblingSlugs: string[] };
  journeyPhase: number;
  voiceFingerprint: { profanityAllowed: boolean; tonePreset: string; preserveTerms: string[] };
}

function buildStrategyPrompt(profile: Record<string, unknown>, brief: { payload: Record<string, unknown>; pageWorthinessScore: number }, otherBriefSlugs: string[]): string {
  const p = brief.payload;
  return [
    'You are editorial_strategist. For ONE page brief, design the strategic context an agency would attach: persona, SEO target, CTA, cluster role, journey phase, voice fingerprint.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    '# Page brief',
    JSON.stringify(p, null, 2),
    '',
    `# Sibling page slugs in this hub (for clusterRole.siblingSlugs)`,
    otherBriefSlugs.map((s) => `- ${s}`).join('\n') || '(none)',
    '',
    '# Instructions',
    'Produce ONE JSON object — no preamble, no markdown fences. Schema:',
    '{',
    '  "persona": { "name": "...", "context": "1 sentence about the reader\'s situation", "objection": "1 sentence — the reader\'s biggest pushback", "proofThatHits": "1 sentence — which specific Hormozi credential/number/story will land" },',
    '  "seo": { "primaryKeyword": "what someone would type into Google", "intent": "informational|transactional|navigational|commercial", "titleTemplate": "60-70 char SEO title", "metaDescription": "150-160 char meta description" },',
    '  "cta": { "primary": "main next-action", "secondary": "fallback next-action" },',
    '  "clusterRole": { "tier": "pillar|spoke", "parentTopic": "kebab-slug or null if pillar", "siblingSlugs": ["..."] },',
    '  "journeyPhase": 1-5,  // 1=Survival, 2=Cashflow, 3=Scale, 4=Leverage, 5=Investing',
    '  "voiceFingerprint": { "profanityAllowed": true|false, "tonePreset": "blunt-tactical|warm-coaching|analytical-detached", "preserveTerms": ["1-1-1 rule", ...] }',
    '}',
    '',
    'JSON object only. Begin with `{` and end with `}`.',
  ].join('\n');
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-editorial-strategy.ts <runId>');

  const db = getDb();
  const cp = await db.select({ payload: channelProfile.payload }).from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (!cp[0]) throw new Error('No channel profile for this run');
  const profile = cp[0].payload as Record<string, unknown>;

  const briefs = await db
    .select({ id: pageBrief.id, position: pageBrief.position, payload: pageBrief.payload, pageWorthinessScore: pageBrief.pageWorthinessScore })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .orderBy(asc(pageBrief.position));

  if (briefs.length === 0) throw new Error('No page briefs for this run');
  console.info(`[ed-strat] ${briefs.length} briefs to enrich`);

  const allSlugs = briefs.map((b) => (b.payload as { slug?: string }).slug ?? '').filter(Boolean);

  for (let i = 0; i < briefs.length; i += 1) {
    const b = briefs[i]!;
    const payload = b.payload as Record<string, unknown>;
    if (payload.editorialStrategy) {
      console.info(`[ed-strat] (${i + 1}/${briefs.length}) ${(payload as { pageTitle?: string }).pageTitle ?? '(untitled)'} — already enriched, skipping`);
      continue;
    }
    console.info(`[ed-strat] (${i + 1}/${briefs.length}) ${(payload as { pageTitle?: string }).pageTitle ?? '(untitled)'}`);
    const slug = (payload as { slug?: string }).slug ?? '';
    const otherSlugs = allSlugs.filter((s) => s !== slug);
    const prompt = buildStrategyPrompt(profile, { payload, pageWorthinessScore: b.pageWorthinessScore ?? 0 }, otherSlugs);
    let strategy: EditorialStrategy;
    try {
      const raw = await runCodex(prompt);
      const json = extractJsonFromCodexOutput(raw);
      strategy = JSON.parse(json) as EditorialStrategy;
    } catch (err) {
      console.warn(`[ed-strat] brief ${b.id} strategy generation failed (continuing): ${(err as Error).message}`);
      continue;
    }
    const newPayload = { ...payload, editorialStrategy: strategy };
    await db.update(pageBrief).set({ payload: newPayload as unknown as Record<string, unknown> }).where(eq(pageBrief.id, b.id));
    console.info(`[ed-strat] brief ${b.id} enriched (phase ${strategy.journeyPhase}, ${strategy.clusterRole?.tier})`);
  }

  await closeDb();
  console.info(`[ed-strat] DONE`);
}

main().catch(async (err) => { await closeDb(); console.error('[ed-strat] FAILED', err); process.exit(1); });
