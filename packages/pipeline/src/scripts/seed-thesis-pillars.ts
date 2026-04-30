/**
 * Operator one-off: generate pillar briefs for thesis slugs that the
 * cluster topology references but which currently have no matching brief.
 * Each thesis is anchored on a synthesis canon node; we feed Codex the
 * channel profile + synthesis node + canon graph titles, and ask for one
 * pillar brief whose slug == thesis slug.
 *
 * Usage:
 *   tsx ./src/scripts/seed-thesis-pillars.ts <runId>
 *
 * The thesis slug → synthesis canon title map is hardcoded for the Hormozi
 * run — generalize when the second creator lands. A non-matching synthesis
 * just logs a warning and skips (Codex generation only proceeds on a real
 * match so we never invent content from thin air).
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, channelProfile, pageBrief } from '@creatorcanon/db/schema';

import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

interface ThesisPillarSpec {
  slug: string;
  expectedTitle: string;
}

const THESIS_PILLARS: ThesisPillarSpec[] = [
  { slug: 'ai-is-leverage-after-judgment', expectedTitle: 'AI Is Leverage After Judgment' },
  { slug: 'cashflow-before-scale', expectedTitle: 'Cashflow Before Scale' },
  { slug: 'discomfort-is-the-admission-price', expectedTitle: 'Discomfort Is The Admission Price' },
];

async function runCodex(prompt: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-thesis-'));
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
      settle(() => reject(new Error(`codex timed out after ${CODEX_TIMEOUT_MS}ms`)));
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
      // Read BEFORE settle so we don't race against tmpDir cleanup.
      let content: string;
      try { content = fs.readFileSync(tmpFile, 'utf8'); }
      catch (e) { settle(() => reject(new Error(`read tmpFile failed: ${(e as Error).message}`))); return; }
      settle(() => resolve(content));
    });
  });
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-thesis-pillars.ts <runId>');

  const db = getDb();
  const cp = await db.select().from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (!cp[0]) throw new Error('No channel profile for run');
  const profile = cp[0].payload;

  const allCanon = await db.select().from(canonNode).where(eq(canonNode.runId, runId));
  const synthesisNodes = allCanon.filter((n) => (n.payload as { kind?: string })?.kind === 'synthesis');
  const canonTitles = allCanon.map((n) => ({
    id: n.id,
    type: n.type,
    title: (n.payload as { title?: string }).title ?? '(untitled)',
    kind: (n.payload as { kind?: string }).kind ?? null,
  }));

  const existingBriefs = await db.select({ payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, runId));
  const existingSlugs = new Set(
    existingBriefs.map((b) => (b.payload as { slug?: string }).slug ?? ''),
  );

  for (const t of THESIS_PILLARS) {
    if (existingSlugs.has(t.slug)) {
      console.info(`[thesis-pillars] ${t.slug}: already exists, skipping`);
      continue;
    }
    const synth = synthesisNodes.find((n) => {
      const title = ((n.payload as { title?: string }).title ?? '').toLowerCase();
      return title === t.expectedTitle.toLowerCase();
    });
    if (!synth) {
      console.warn(`[thesis-pillars] ${t.slug}: no synthesis canon matches "${t.expectedTitle}"; skipping`);
      continue;
    }

    const prompt = [
      'You are page_planner. Produce ONE pillar-tier hub-page brief for a thesis.',
      '',
      '# Channel profile',
      JSON.stringify(profile, null, 2),
      '',
      '# Anchor synthesis canon node (this IS the thesis)',
      JSON.stringify(synth.payload, null, 2),
      '',
      '# Adjacent canon nodes (for outline canonNodeIds — pick relevant ones)',
      JSON.stringify(canonTitles, null, 2),
      '',
      '# REQUIREMENTS',
      `- Output a single JSON object representing one brief whose slug is EXACTLY: "${t.slug}"`,
      '- pageType: "thesis"',
      '- editorialStrategy.clusterRole = { tier: "pillar", parentTopic: null, siblingSlugs: [] } — leave siblings empty; another script fills them.',
      '- 4-section outline; each section has { intent: string, sectionTitle: string, canonNodeIds: string[] (3-5 valid IDs from the canon graph above) }.',
      '- Required top-level fields: slug, pageType, position (0), pageTitle, openingHook, audienceQuestion, outline, editorialStrategy, pageWorthinessScore (>=92), primaryCanonNodeIds, supportingCanonNodeIds.',
      '- editorialStrategy required keys: cta { primary, secondary }, seo { intent, primaryKeyword, titleTemplate, metaDescription }, persona { name, context, objection, proofThatHits }, clusterRole, journeyPhase (1-5), voiceFingerprint { tonePreset, preserveTerms, profanityAllowed }.',
      '- Match the channel\'s blunt-tactical voice with profanityAllowed=true.',
      '- The pageTitle should be editorial, NOT identical to the synthesis title — make it a sharper hub-page headline.',
      '',
      '# OUTPUT FORMAT — return ONLY the JSON object, no fences, no commentary.',
    ].join('\n');

    console.info(`[thesis-pillars] generating ${t.slug}…`);
    const raw = await runCodex(prompt);
    let brief: Record<string, unknown>;
    try {
      const jsonStr = extractJsonFromCodexOutput(raw);
      brief = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch (err) {
      console.error(`[thesis-pillars] ${t.slug}: failed to extract/parse JSON: ${(err as Error).message.slice(0, 200)}`);
      continue;
    }

    // Force the slug + clusterRole shape regardless of what Codex returned.
    brief.slug = t.slug;
    const es = (brief.editorialStrategy ?? {}) as Record<string, unknown>;
    es.clusterRole = { tier: 'pillar', parentTopic: null, siblingSlugs: [] };
    brief.editorialStrategy = es;
    if (typeof brief.position !== 'number') brief.position = 0;

    await db.insert(pageBrief).values({
      id: crypto.randomUUID(),
      workspaceId: cp[0].workspaceId,
      runId,
      position: 0,
      payload: brief,
    });
    console.info(`[thesis-pillars] ${t.slug}: inserted (position=0; run normalize-brief-positions to fix)`);
  }
  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[thesis-pillars] FAILED', err);
  process.exit(1);
});
