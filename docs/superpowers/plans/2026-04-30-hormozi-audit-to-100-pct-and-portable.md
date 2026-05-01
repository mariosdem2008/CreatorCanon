# Hormozi Audit → 100% Agency-Ready + Creator-Portable Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the Hormozi audit from 88% (Phase 1.5 final) to **100% agency-ready** while simultaneously **decoupling the pipeline from any single creator** so the same code path produces archetype-appropriate audits for any creator (Hormozi, Huberman, Joshua Weissman, Sam Harris, etc.) without per-creator code edits.

**Architecture:**

The work splits into three phases with stop gates between each:

- **Phase 1.6 (~2-3 hours, target 95%)** — tactical patches that close the remaining Hormozi audit gaps: brief catalog topical balance, missing canon node, citation-format polish. All work happens in the existing offline scripts; no architectural changes.
- **Phase 2 (~1-2 days, target 99%)** — the architectural pivot from "Hormozi-flavored prompts" to "creator-agnostic skill files driving runtime prompts." Adds visual moments via Groq vision, citation-chain validator, voice-fingerprint compliance, and offline stage-cost tracking. Eliminates every Hormozi-specific prompt example.
- **Phase 3 (~6-8 hours, target 100% + production-ready)** — QA worksheet generator, generic creator-onboarding flow (replaces hardcoded YouTube URL mappings), sibling-slug reconciliation, wire skill-driven path into production canon_v1 pipeline, end-to-end smoke test against a non-Hormozi creator archetype to verify portability.

**Tech Stack:** Same as Phases 1 + 1.5 — TypeScript, Drizzle, PostgreSQL (Neon), Codex CLI v0.125.0 (subprocess), Next.js, Cloudflare R2, Groq (transcription + vision).

**Stop gates:** After Phase 1.6 (you review the audit at 95%), after Phase 2 (you spot-check that Hormozi audit didn't regress + a non-Hormozi smoke produces sensible output), after Phase 3 (full agency-ready handoff verified).

---

## File Structure

**New files (Phase 1.6):**
- `packages/pipeline/src/scripts/seed-targeted-briefs.ts` — generates one brief per requested title with editorialStrategy attached, used to fill specific topical gaps in the brief catalog
- `packages/pipeline/src/scripts/seed-targeted-canon.ts` — generates one canon node for a specific named framework, used to backfill missing nodes

**New files (Phase 2):**
- `.claude/skills/pipeline/framework-extraction-rubric/SKILL.md` — rubric for what makes a publishable framework canon node
- `.claude/skills/pipeline/editorial-strategy-rubric/SKILL.md` — rubric for persona/SEO/CTA/cluster/voice generation
- `.claude/skills/pipeline/cross-video-synthesis-rubric/SKILL.md` — rubric for when to merge vs split, what makes a synthesis "cross-cutting"
- `.claude/skills/pipeline/citation-chain-rubric/SKILL.md` — rubric for claim → segmentId binding, what counts as supported
- `.claude/skills/pipeline/voice-fingerprint-rubric/SKILL.md` — rubric for tone presets, profanity rules, terms-to-preserve
- `.claude/skills/pipeline/creator-archetypes/operator-coach.md` — Hormozi-style examples (phase ladder, synthesis examples, voice presets)
- `.claude/skills/pipeline/creator-archetypes/science-explainer.md` — Huberman-style
- `.claude/skills/pipeline/creator-archetypes/instructional-craft.md` — Joshua Weissman-style cooking/craft
- `.claude/skills/pipeline/creator-archetypes/contemplative-thinker.md` — Sam Harris-style
- `.claude/skills/pipeline/creator-archetypes/_DEFAULT.md` — fallback when archetype detection is uncertain
- `packages/pipeline/src/agents/skills/skill-loader.ts` — reads SKILL.md files, parses sections, exposes `loadSkill(name)`
- `packages/pipeline/src/agents/skills/build-system-prompt.ts` — `buildSystemPrompt(skill, mode, archetype?)` assembles a runtime prompt
- `packages/pipeline/src/agents/skills/archetype-detector.ts` — maps a `ChannelProfilePayload` to an archetype slug
- `packages/pipeline/src/scripts/seed-visual-moments.ts` — extracts frames via ffmpeg, classifies each via Groq vision, persists `visual_moment` rows
- `packages/pipeline/src/scripts/validate-citation-chain.ts` — for every claim in canon/briefs, verify a real `segmentId` exists; emit unsupported-claim list
- `packages/pipeline/src/scripts/check-voice-fingerprint.ts` — score generated prose against the brief's voice fingerprint; emit violation list
- `packages/pipeline/src/scripts/track-offline-stage-cost.ts` — instrument offline scripts to write `generation_stage_run` rows so the audit page's stage-cost breakdown stops being empty

**New files (Phase 3):**
- `packages/pipeline/src/scripts/generate-qa-worksheet.ts` — auto-generate a human-editor checklist (sampled claims, voice spot-checks, cluster sanity, CTA validation)
- `packages/pipeline/src/scripts/onboard-creator.ts` — generic CLI: takes a directory of MP4s + YouTube URL list (or auto-fetches), runs the full audit pipeline end-to-end
- `packages/pipeline/src/scripts/reconcile-sibling-slugs.ts` — second pass over briefs to fix `clusterRole.siblingSlugs` based on the actual cluster topology

**Modified files (Phase 1.6):**
- `packages/pipeline/src/scripts/seed-audit-via-codex.ts` — minor prompt tweak in VIC generation to encourage YouTube-compatible time formats over ms-ranges (so future runs avoid bare `[12345ms-67890ms]` citations)

**Modified files (Phase 2):**
- `packages/pipeline/src/scripts/seed-audit-via-codex.ts` — refactor the inlined prompts (channel_profile, VIC, canon, synthesis, journey, briefs) to call `buildSystemPrompt(skill, mode, archetype)` instead of containing the prompt text directly. The skill files become the source of truth.

**Modified files (Phase 3):**
- `packages/pipeline/src/dispatch-queued-run.ts` — when the production pipeline reaches the audit phase, it now calls the skill-driven generators (replacing the OpenAI/Gemini tool-using agents that hit quota walls). For dev iteration this stays opt-in via `PIPELINE_AUDIT_PATH=skill-driven`.
- `apps/web/src/lib/audit/build-audit-markdown.ts` — surface QA worksheet section + Hormozi by the Numbers per-claim citation links

---

# Phase 1.6 — Close the Hormozi Audit Gaps (target 95%)

## Task 1.6.1: Targeted brief generator for missing pillars

**Files:**
- Create: `packages/pipeline/src/scripts/seed-targeted-briefs.ts`

**Why:** The Phase 1.5 brief catalog is 8/13 AI, 0/13 money/sales/pricing. Canon graph HAS the relevant frameworks (Six-Step Roadmap to First $100K, Premium One-on-One Bootstrap, 4-4-4 Split, 1-1-1 Rule, Maker vs Manager, Expensive-to-Few or Cheap-to-Everyone, Three Frames for a 10x Offer, Value Deconstruction) — they just didn't get briefed. We need a tool that takes a list of "REQUIRED brief titles" and produces exactly one brief per title (with editorialStrategy), with the canon graph + channel profile in scope so each brief points at the right canon nodes.

- [ ] **Step 1: Create the script**

Create `packages/pipeline/src/scripts/seed-targeted-briefs.ts`:

```ts
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
    if (proc.stdin) { proc.stdin.on('error', () => {}); proc.stdin.write(prompt); proc.stdin.end(); }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} settle(() => reject(new Error(`codex timed out after ${CODEX_TIMEOUT_MS}ms`))); }, CODEX_TIMEOUT_MS);
    proc.on('error', (err) => { clearTimeout(timer); settle(() => reject(new Error(`codex spawn failed: ${err.message}`))); });
    proc.on('close', (code) => { clearTimeout(timer); if (code !== 0) { settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`))); return; } try { settle(() => resolve(fs.readFileSync(tmpFile, 'utf8'))); } catch (e) { settle(() => reject(new Error(`output unreadable: ${(e as Error).message}`))); } });
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
    const position = existingBriefs.length + i + 100; // positions appended at the end
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
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Run for the 7 missing pillar briefs**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/seed-targeted-briefs.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b \
  "First $100K Roadmap" \
  "Premium One-on-One Bootstrap" \
  "The 10x Offer: Three Frames for Premium Pricing" \
  "Value Deconstruction: Engineering an Irresistible Offer" \
  "Anchor-and-Downsell Sales Move" \
  "1-1-1 Rule for Early Founders" \
  "Maker vs Manager Time"
```

Expected: 7 lines like `[targeted-briefs] "<title>" written as pb_<id> (position N)`. Each call takes ~30-60s, so total runtime ~5-7 min.

- [ ] **Step 4: Verify the catalog now has all four thematic clusters**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const rows = await db.select({ payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, '037458ae-1439-4e56-a8da-aa967f2f5e1b'));
  console.log('Total briefs:', rows.length);
  for (const r of rows) console.log('-', (r.payload as any).pageTitle);
  await closeDb();
})();
"
```
Expected: 20 briefs (13 from Phase 1.5 + 7 new). The catalog now spans AI, Money, Pricing, Sales, Mindset.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/scripts/seed-targeted-briefs.ts
git commit -m "feat(audit-seed): targeted brief generator for filling topical gaps

The Phase 1.5 brief iterator front-loaded AI titles because per-video
canon was returned in video order. The catalog ended at 13 briefs with
8/13 AI, 4/13 mindset, 0/13 money/sales/pricing despite the canon
graph having all the money/pricing frameworks.

This script takes an explicit list of REQUIRED titles and produces
one brief per title with editorialStrategy attached. One Codex call
per title (no iteration accumulator), so each requested title is
guaranteed to land. Used to backfill the missing money/sales/pricing
pillars."
```

## Task 1.6.2: Backfill Top 10% Learning Loop canon node

**Files:**
- Create: `packages/pipeline/src/scripts/seed-targeted-canon.ts`

**Why:** The "Top 10% Learning Loop" framework appears in the $100K VIC but didn't get canonized. It's a uniquely Hormozi-flavored reframe of the 10,000-hour rule and deserves its own canon node.

- [ ] **Step 1: Create a generic targeted-canon script**

Create `packages/pipeline/src/scripts/seed-targeted-canon.ts`:

```ts
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
    const settle = (cb: () => void) => { if (settled) return; settled = true; try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} cb(); };
    const proc = spawn(CODEX_BINARY, ['exec', '--skip-git-repo-check', '-o', tmpFile], { stdio: ['pipe', 'ignore', 'pipe'], env: process.env, shell: process.platform === 'win32' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    if (proc.stdin) { proc.stdin.on('error', () => {}); proc.stdin.write(prompt); proc.stdin.end(); }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} settle(() => reject(new Error(`codex timed out after ${CODEX_TIMEOUT_MS}ms`))); }, CODEX_TIMEOUT_MS);
    proc.on('error', (err) => { clearTimeout(timer); settle(() => reject(new Error(`codex spawn failed: ${err.message}`))); });
    proc.on('close', (code) => { clearTimeout(timer); if (code !== 0) { settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`))); return; } try { settle(() => resolve(fs.readFileSync(tmpFile, 'utf8'))); } catch (e) { settle(() => reject(new Error(`output unreadable: ${(e as Error).message}`))); } });
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
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck
```

- [ ] **Step 3: Run for Top 10% Learning Loop**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/seed-targeted-canon.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b mu_680b5481c40b "Top 10% Learning Loop"
```

Expected: `[targeted-canon] "Top 10% Learning Loop" written as cn_<id>`.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/scripts/seed-targeted-canon.ts
git commit -m "feat(audit-seed): targeted single-node canon generator

Mirror of seed-targeted-briefs at the canon layer. Used to backfill
specifically-named frameworks the canon iterator missed. One Codex
call per node, scoped to ONE VIC, so each requested framework is
guaranteed to land."
```

## Task 1.6.3: VIC prompt tweak — prefer YouTube-compatible time formats

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

**Why:** Some VIC citations come out as `[1506543ms-1573313ms]` ms-ranges instead of `[m:ss]` formats. The linkifier handles them as fallback (no clickable link), but the cleaner output format is `[25:06]` which the linkifier can resolve to YouTube via context. This is a one-line prompt tweak that improves future VIC runs.

- [ ] **Step 1: Find the VIC generation prompt and add the format guidance**

In `packages/pipeline/src/scripts/seed-audit-via-codex.ts`, find the `generateVic` function. In its prompt (the lines that build the user message for the per-video VIC call), add this instruction near the OUTPUT FORMAT block:

```ts
    '',
    '# CITATION FORMAT',
    'When citing transcript evidence inline in main ideas, lessons, examples, stories, mistakes, claims, or contrarian takes, prefer the format `[<segmentId>]` (the segment\'s UUID) so the markdown export can render it as a clickable YouTube timestamp. AVOID `[<startMs>ms-<endMs>ms]` ranges — they can\'t be linkified back to a YouTube URL. If you need a range, use `[m:ss-m:ss]` format (just the time, no IDs).',
    '',
```

Place this block immediately above the OUTPUT FORMAT instruction.

- [ ] **Step 2: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): VIC prompt prefers segmentId citations over ms-range

The linkifier can resolve segmentId UUIDs to clickable YouTube
timestamps but can't link bare ms-range citations because they
lack the videoId binding. This prompt addition steers Codex
toward the linkable format on future VIC runs.

Existing VICs are unaffected — this only impacts new runs or
re-runs with --regen-vic."
```

(Note: this fix is forward-looking. The Hormozi VICs already have some ms-range citations baked in. We accept those as-is; the linkifier degrades gracefully to bare `[m:ss]` for them.)

## Task 1.6.4: Phase 1.6 verification + STOP gate

- [ ] **Step 1: Inspect final state**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/inspect-audit-state.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected:
- canon_node rows: ~36 (35 from Phase 1.5 + 1 Top 10% Learning Loop)
- page_brief rows: ~20 (13 from Phase 1.5 + 7 targeted)
- status: audit_ready

- [ ] **Step 2: User opens audit page**

URL: `http://localhost:3000/app/projects/ca713f3c-86d3-4430-8003-122d70cb4041/runs/037458ae-1439-4e56-a8da-aa967f2f5e1b/audit`

Verify:
- Knowledge Graph now has Top 10% Learning Loop
- Proposed Hub Pages now has 7 new money/sales/pricing briefs (First $100K Roadmap, Premium One-on-One Bootstrap, etc.)
- Cluster Topology section now shows a 4th cluster (money/cashflow/pricing)

- [ ] **Step 3: STOP — User review of Phase 1.6**

The audit should now read at ~95% agency-ready. Get user verdict before proceeding to Phase 2.

If approved → continue to Phase 2.

---

# Phase 2 — Skills Architecture + Visual Moments + Validators (target 99%)

This phase pivots the pipeline from "Hormozi-flavored prompts inlined in seed-audit-via-codex.ts" to "creator-agnostic skill files driving runtime prompts." This is the architectural piece that makes the next creator hub a 2-minute config job instead of a re-engineering job.

## Task 2.1: Skill directory scaffolding + skill loader

**Files:**
- Create: `.claude/skills/pipeline/framework-extraction-rubric/SKILL.md`
- Create: `.claude/skills/pipeline/editorial-strategy-rubric/SKILL.md`
- Create: `.claude/skills/pipeline/cross-video-synthesis-rubric/SKILL.md`
- Create: `.claude/skills/pipeline/citation-chain-rubric/SKILL.md`
- Create: `.claude/skills/pipeline/voice-fingerprint-rubric/SKILL.md`
- Create: `packages/pipeline/src/agents/skills/skill-loader.ts`

**Why:** Each rubric becomes the single source of truth for what a "good" output looks like in that stage. The skill format is plain markdown so it's readable both by Claude (during dev iteration) and by the runtime prompt builder (which extracts specific sections at runtime).

- [ ] **Step 1: Define the SKILL.md format**

Each skill file follows this structure:

```markdown
---
name: framework-extraction-rubric
description: Use when extracting canon nodes representing named frameworks, playbooks, lessons, or principles from creator video intelligence cards. Defines the rubric for what makes a publishable canon node.
---

# Framework Extraction Rubric

## PURPOSE
[1-2 sentence purpose]

## SCHEMA
[The exact JSON shape the output must conform to]

## RUBRIC — what makes a publishable framework canon node
[Bullet rubric: required fields, named-thing test, sequencing rationale, etc.]

## EXAMPLES_GOOD
[3-5 examples of strong outputs the runtime prompt may not include but the dev does]

## EXAMPLES_BAD
[3-5 examples of weak outputs to avoid]

## ANTI_PATTERNS
[Common failure modes and how to detect them]

## OUTPUT_FORMAT
[The exact prompt text that goes into the runtime system prompt]
```

- [ ] **Step 2: Author the 5 rubric skill files**

Create `.claude/skills/pipeline/framework-extraction-rubric/SKILL.md` with the framework-extraction rubric (capture: title required, summary 1-2 sentences, whenToUse + whenNotToUse, commonMistake, successSignal, sequencingRationale, preconditions/steps/failureModes/examples for procedural types, definition for definition types).

Create `.claude/skills/pipeline/editorial-strategy-rubric/SKILL.md` with the editorial-strategy rubric (persona archetype, SEO intent classification, CTA patterns, cluster topology rules, journey phase definitions, voice fingerprint).

Create `.claude/skills/pipeline/cross-video-synthesis-rubric/SKILL.md` with synthesis rubric (must connect 3+ canon nodes, unifying thread is one sentence, distinct from any single canon node, page-worthy).

Create `.claude/skills/pipeline/citation-chain-rubric/SKILL.md` with citation rubric (every quoted claim must trace to segmentId, every framework's preconditions must derive from VIC content, no hallucinated facts).

Create `.claude/skills/pipeline/voice-fingerprint-rubric/SKILL.md` with voice rubric (creator's verbatim phrases preserved, profanity rules per archetype, tone preset selection, when to compress vs expand).

(The actual content of each SKILL.md is ~150-300 lines of markdown. The structure is fixed; the content is the rubric.)

- [ ] **Step 3: Create the skill loader**

Create `packages/pipeline/src/agents/skills/skill-loader.ts`:

```ts
/**
 * Skill loader: reads SKILL.md files from .claude/skills/pipeline/ and parses
 * the section structure (PURPOSE / SCHEMA / RUBRIC / EXAMPLES_GOOD /
 * EXAMPLES_BAD / ANTI_PATTERNS / OUTPUT_FORMAT). The runtime prompt builder
 * uses these parsed sections to construct system prompts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ParsedSkill {
  name: string;
  description: string;
  sections: Record<string, string>;
}

const SKILL_ROOT = path.resolve(__dirname, '../../../../../.claude/skills/pipeline');

export function loadSkill(skillName: string): ParsedSkill {
  const skillPath = path.join(SKILL_ROOT, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill not found: ${skillName} (looked at ${skillPath})`);
  }
  const raw = fs.readFileSync(skillPath, 'utf8');

  // Parse YAML frontmatter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error(`Skill ${skillName}: no YAML frontmatter`);
  const fmText = fmMatch[1]!;
  const body = fmMatch[2]!;

  const fmLines = fmText.split('\n');
  const fm: Record<string, string> = {};
  for (const ln of fmLines) {
    const colon = ln.indexOf(':');
    if (colon < 0) continue;
    fm[ln.slice(0, colon).trim()] = ln.slice(colon + 1).trim();
  }

  // Parse `## SECTION_NAME` headers
  const sections: Record<string, string> = {};
  const sectionPattern = /^## ([A-Z_]+)\s*$/gm;
  let lastEnd = 0;
  let lastName = '';
  const matches: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = sectionPattern.exec(body)) !== null) {
    matches.push({ name: m[1]!, start: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i]!.start;
    const end = i < matches.length - 1 ? matches[i + 1]!.start - 4 - matches[i + 1]!.name.length : body.length;
    sections[matches[i]!.name] = body.slice(start, end).trim();
  }

  return {
    name: fm.name ?? skillName,
    description: fm.description ?? '',
    sections,
  };
}

export function listSkills(): string[] {
  if (!fs.existsSync(SKILL_ROOT)) return [];
  return fs.readdirSync(SKILL_ROOT).filter((d) => fs.statSync(path.join(SKILL_ROOT, d)).isDirectory());
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck
git add .claude/skills/pipeline packages/pipeline/src/agents/skills/skill-loader.ts
git commit -m "feat(skills): scaffold pipeline rubric skills + skill loader

Five rubric skills capture the editorial standards for framework
extraction, editorial strategy, cross-video synthesis, citation chains,
and voice fingerprints. Each SKILL.md has a fixed section structure
(PURPOSE / SCHEMA / RUBRIC / EXAMPLES_GOOD / EXAMPLES_BAD /
ANTI_PATTERNS / OUTPUT_FORMAT) so the runtime prompt builder can pull
specific sections.

skill-loader.ts parses the format and exposes loadSkill(name)."
```

## Task 2.2: Creator archetype skills + archetype detector

**Files:**
- Create: `.claude/skills/pipeline/creator-archetypes/operator-coach.md`
- Create: `.claude/skills/pipeline/creator-archetypes/science-explainer.md`
- Create: `.claude/skills/pipeline/creator-archetypes/instructional-craft.md`
- Create: `.claude/skills/pipeline/creator-archetypes/contemplative-thinker.md`
- Create: `.claude/skills/pipeline/creator-archetypes/_DEFAULT.md`
- Create: `packages/pipeline/src/agents/skills/archetype-detector.ts`

**Why:** Each archetype carries the creator-class-specific prompt examples, journey phase ladders, voice presets, and synthesis examples. The detector reads the channel profile and picks the archetype.

- [ ] **Step 1: Author the 5 archetype files**

Each archetype file has this structure:

```markdown
---
archetype: operator-coach
description: Tactical business operators who teach via concrete frameworks, money math, and contrarian takes. Examples: Alex Hormozi, Ali Abdaal, Codie Sanchez.
---

# Operator-Coach Archetype

## DETECTION_HEURISTICS
[Channel profile signals: niche keywords, dominantTone, expertiseCategory, monetizationAngle]

## JOURNEY_PHASE_LADDER
1. Survival → first $100K roadmap
2. Cashflow → premium 1-on-1, focus, pricing
3. Scale → workflow thinking, hiring, offers
4. Leverage → AI as leverage, BYOA
5. Investing → barbell strategy, durable bets

## SYNTHESIS_EXAMPLES
- The Money/Cashflow Sequence
- Pricing-and-Positioning Thread
- The Anti-Comfort Theory
- The Output-First Operating System
[~6-10 examples specific to this archetype]

## VOICE_PRESETS
- profanityAllowed: true (operator content tolerates blunt language)
- tonePreset: "blunt-tactical"
- preserveTerms: framework names verbatim, money figures, named playbooks

## TYPICAL_PILLARS
- Money/Pricing
- Sales/Offers
- Mindset/Discipline
- AI/Operations (when relevant)
- Investing/Wealth-Building (when relevant)

## ANTI_PATTERNS
- Don't apply this archetype to teachers, scientists, or contemplative content
- Don't force the 5-phase ladder if the creator's content doesn't span survival-to-investing
```

Create the operator-coach archetype with the actual Hormozi-style examples (already implicit in the current pipeline). Create science-explainer (Huberman: lab-to-life translation, mechanism-first, citation-heavy). Create instructional-craft (Joshua Weissman: technique mastery, recipe progression, gear knowledge). Create contemplative-thinker (Sam Harris: introspective inquiry, consciousness, ethics). Create _DEFAULT.md as a fallback when detection is uncertain.

- [ ] **Step 2: Create archetype detector**

Create `packages/pipeline/src/agents/skills/archetype-detector.ts`:

```ts
/**
 * Archetype detector: maps a ChannelProfilePayload to a creator archetype
 * slug. Runtime prompts then load the archetype's examples + voice presets.
 *
 * Detection is heuristic-based on niche keywords, dominantTone, and
 * expertiseCategory. The fallback is "_DEFAULT" which produces archetype-
 * neutral prompts.
 */

export type ArchetypeSlug = 'operator-coach' | 'science-explainer' | 'instructional-craft' | 'contemplative-thinker' | '_DEFAULT';

interface ChannelProfileShape {
  niche?: string;
  dominantTone?: string;
  expertiseCategory?: string;
  monetizationAngle?: string;
  recurringThemes?: string[];
  [k: string]: unknown;
}

const KEYWORDS: Array<{ archetype: ArchetypeSlug; keywords: string[]; tone: string[] }> = [
  {
    archetype: 'operator-coach',
    keywords: ['business', 'entrepreneur', 'sales', 'marketing', 'operator', 'founder', 'pricing', 'offer', 'startup', 'AI leverage', 'cashflow', 'wealth'],
    tone: ['blunt', 'tactical', 'contrarian', 'no-excuses', 'operator'],
  },
  {
    archetype: 'science-explainer',
    keywords: ['science', 'neuroscience', 'biology', 'research', 'study', 'mechanism', 'physiology', 'lab', 'evidence-based'],
    tone: ['analytical', 'measured', 'curious', 'evidence-based', 'detailed'],
  },
  {
    archetype: 'instructional-craft',
    keywords: ['cooking', 'recipe', 'technique', 'craft', 'tutorial', 'how-to', 'making', 'building', 'fitness form', 'exercise technique', 'art', 'music'],
    tone: ['warm', 'instructional', 'demonstrative', 'patient'],
  },
  {
    archetype: 'contemplative-thinker',
    keywords: ['meditation', 'consciousness', 'philosophy', 'ethics', 'mindfulness', 'introspection', 'self-inquiry', 'metaphysics'],
    tone: ['reflective', 'thoughtful', 'measured', 'inquisitive'],
  },
];

export function detectArchetype(profile: ChannelProfileShape): ArchetypeSlug {
  const haystack = [
    profile.niche ?? '',
    profile.dominantTone ?? '',
    profile.expertiseCategory ?? '',
    profile.monetizationAngle ?? '',
    ...(profile.recurringThemes ?? []),
  ].join(' ').toLowerCase();

  let bestArchetype: ArchetypeSlug = '_DEFAULT';
  let bestScore = 0;
  for (const candidate of KEYWORDS) {
    let score = 0;
    for (const kw of candidate.keywords) if (haystack.includes(kw.toLowerCase())) score += 2;
    for (const t of candidate.tone) if (haystack.includes(t.toLowerCase())) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = candidate.archetype;
    }
  }
  // Require minimum confidence; fall back to default on weak signal
  return bestScore >= 4 ? bestArchetype : '_DEFAULT';
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck
git add .claude/skills/pipeline/creator-archetypes packages/pipeline/src/agents/skills/archetype-detector.ts
git commit -m "feat(skills): creator archetype skills + heuristic detector

Five archetype files capture archetype-specific prompt examples:
- operator-coach (Hormozi, Codie Sanchez): money/pricing/sales pillars
- science-explainer (Huberman): mechanism-first, evidence-heavy
- instructional-craft (Weissman, Boweries): technique progression
- contemplative-thinker (Harris): introspection, ethics
- _DEFAULT fallback when archetype is uncertain

The detector scores keyword + tone matches in the channel profile
and picks the highest-confidence archetype, with a minimum
confidence threshold to avoid wrong assignments."
```

## Task 2.3: buildSystemPrompt harness

**Files:**
- Create: `packages/pipeline/src/agents/skills/build-system-prompt.ts`

**Why:** This is the one function that turns "skill file + archetype + mode" into the runtime prompt sent to Codex. The harness lets us update prompts by editing markdown instead of editing TypeScript.

- [ ] **Step 1: Create the harness**

```ts
/**
 * Runtime system-prompt builder. Takes a skill name (e.g.
 * 'framework-extraction-rubric') + an archetype slug + a mode and
 * returns the assembled prompt string.
 *
 * Mode is one of:
 * - 'extract'     : the prompt for the actual generation call
 * - 'validate'    : a verifier prompt
 * - 'few-shot'    : extract + EXAMPLES_GOOD inlined for few-shot priming
 *
 * Sections from the skill are concatenated into the prompt; archetype
 * sections (JOURNEY_PHASE_LADDER, SYNTHESIS_EXAMPLES, VOICE_PRESETS,
 * TYPICAL_PILLARS) are loaded from .claude/skills/pipeline/creator-archetypes/
 * and merged into the prompt as archetype-specific examples.
 */

import { loadSkill, type ParsedSkill } from './skill-loader';
import { detectArchetype, type ArchetypeSlug } from './archetype-detector';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHETYPE_ROOT = path.resolve(__dirname, '../../../../../.claude/skills/pipeline/creator-archetypes');

interface ArchetypeContent {
  detectionHeuristics?: string;
  journeyPhaseLadder?: string;
  synthesisExamples?: string;
  voicePresets?: string;
  typicalPillars?: string;
  antiPatterns?: string;
}

function loadArchetype(archetype: ArchetypeSlug): ArchetypeContent {
  const archetypePath = path.join(ARCHETYPE_ROOT, `${archetype}.md`);
  if (!fs.existsSync(archetypePath)) return {};
  const raw = fs.readFileSync(archetypePath, 'utf8');
  // Same section parsing as skill-loader, simplified
  const sections: Record<string, string> = {};
  const pattern = /^## ([A-Z_]+)\s*$/gm;
  const matches: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(raw)) !== null) matches.push({ name: m[1]!, start: m.index + m[0].length });
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i]!.start;
    const end = i < matches.length - 1 ? matches[i + 1]!.start - 4 - matches[i + 1]!.name.length : raw.length;
    sections[matches[i]!.name] = raw.slice(start, end).trim();
  }
  return {
    detectionHeuristics: sections.DETECTION_HEURISTICS,
    journeyPhaseLadder: sections.JOURNEY_PHASE_LADDER,
    synthesisExamples: sections.SYNTHESIS_EXAMPLES,
    voicePresets: sections.VOICE_PRESETS,
    typicalPillars: sections.TYPICAL_PILLARS,
    antiPatterns: sections.ANTI_PATTERNS,
  };
}

export type SystemPromptMode = 'extract' | 'validate' | 'few-shot';

export interface BuildSystemPromptInput {
  skill: string;
  mode: SystemPromptMode;
  archetype?: ArchetypeSlug;
  channelProfile?: Record<string, unknown>;
}

export function buildSystemPrompt(input: BuildSystemPromptInput): string {
  const skill = loadSkill(input.skill);
  const archetype = input.archetype ?? (input.channelProfile ? detectArchetype(input.channelProfile) : '_DEFAULT');
  const archetypeContent = loadArchetype(archetype);

  const parts: string[] = [];
  parts.push(`# Skill: ${skill.name}`);
  if (skill.sections.PURPOSE) parts.push(skill.sections.PURPOSE);
  if (skill.sections.SCHEMA) {
    parts.push('# Schema');
    parts.push(skill.sections.SCHEMA);
  }
  if (skill.sections.RUBRIC) {
    parts.push('# Rubric');
    parts.push(skill.sections.RUBRIC);
  }
  if (input.mode === 'few-shot' && skill.sections.EXAMPLES_GOOD) {
    parts.push('# Examples (good)');
    parts.push(skill.sections.EXAMPLES_GOOD);
  }
  if (skill.sections.ANTI_PATTERNS) {
    parts.push('# Anti-patterns to avoid');
    parts.push(skill.sections.ANTI_PATTERNS);
  }
  if (archetypeContent.synthesisExamples && (input.skill === 'cross-video-synthesis-rubric' || input.skill === 'editorial-strategy-rubric')) {
    parts.push(`# Archetype-specific examples (${archetype})`);
    parts.push(archetypeContent.synthesisExamples);
  }
  if (archetypeContent.journeyPhaseLadder && input.skill === 'editorial-strategy-rubric') {
    parts.push(`# Journey phase ladder (${archetype})`);
    parts.push(archetypeContent.journeyPhaseLadder);
  }
  if (archetypeContent.voicePresets && input.skill === 'voice-fingerprint-rubric') {
    parts.push(`# Voice presets (${archetype})`);
    parts.push(archetypeContent.voicePresets);
  }
  if (skill.sections.OUTPUT_FORMAT) {
    parts.push('# Output format');
    parts.push(skill.sections.OUTPUT_FORMAT);
  }
  return parts.join('\n\n');
}
```

- [ ] **Step 2: Add unit tests**

Create `packages/pipeline/src/agents/skills/test/build-system-prompt.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../build-system-prompt';
import { detectArchetype } from '../archetype-detector';

describe('buildSystemPrompt', () => {
  it('builds a prompt for framework-extraction-rubric in extract mode', () => {
    const prompt = buildSystemPrompt({
      skill: 'framework-extraction-rubric',
      mode: 'extract',
      archetype: 'operator-coach',
    });
    assert(prompt.length > 100, 'prompt should be substantial');
    assert(prompt.includes('framework-extraction-rubric'), 'prompt mentions skill name');
  });

  it('few-shot mode includes EXAMPLES_GOOD', () => {
    const extract = buildSystemPrompt({ skill: 'framework-extraction-rubric', mode: 'extract', archetype: 'operator-coach' });
    const fewShot = buildSystemPrompt({ skill: 'framework-extraction-rubric', mode: 'few-shot', archetype: 'operator-coach' });
    assert(fewShot.length > extract.length, 'few-shot has more content');
  });
});

describe('detectArchetype', () => {
  it('detects operator-coach from Hormozi-style profile', () => {
    const a = detectArchetype({
      niche: 'Entrepreneurship, business growth, AI leverage, sales, marketing',
      dominantTone: 'blunt, tactical, contrarian',
      expertiseCategory: 'Business operator',
      monetizationAngle: 'high-trust educational content',
      recurringThemes: ['cashflow', 'pricing', 'AI as leverage'],
    });
    assert.equal(a, 'operator-coach');
  });

  it('detects science-explainer from neuroscience profile', () => {
    const a = detectArchetype({
      niche: 'Neuroscience, sleep, exercise, light exposure, evidence-based',
      dominantTone: 'analytical, measured, evidence-based',
      expertiseCategory: 'Neuroscientist',
      recurringThemes: ['mechanism', 'study', 'physiology'],
    });
    assert.equal(a, 'science-explainer');
  });

  it('falls back to _DEFAULT on weak signal', () => {
    const a = detectArchetype({ niche: 'random hobbies' });
    assert.equal(a, '_DEFAULT');
  });
});
```

- [ ] **Step 3: Run tests + commit**

```bash
cd packages/pipeline && pnpm test src/agents/skills/test/
git add packages/pipeline/src/agents/skills/
git commit -m "feat(skills): buildSystemPrompt harness + archetype-aware prompt assembly

The harness loads a rubric skill + an archetype skill, merges
relevant sections (synthesis examples, journey ladder, voice presets)
into the runtime prompt. Modes: 'extract' for generation, 'few-shot'
for example-primed generation, 'validate' for verifier prompts.

Tests cover prompt building + archetype detection on Hormozi
(operator-coach), Huberman (science-explainer), and _DEFAULT
fallback."
```

## Task 2.4: Refactor seed-audit-via-codex.ts to use skill-driven prompts

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

**Why:** Replace the inlined prompt strings with `buildSystemPrompt(...)` calls. After this change, updating the editorial standards is a markdown edit, and a new creator hub gets archetype-appropriate prompts automatically.

- [ ] **Step 1: Refactor in stages**

For each of the 6 prompt-building sites in `seed-audit-via-codex.ts`:
1. `generateChannelProfile` → uses skill `channel-profile-rubric` (will need to create) + archetype `_DEFAULT` initially (channel profile generation is what DETECTS the archetype)
2. `generateVic` → uses skill `vic-extraction-rubric` (create) + detected archetype
3. `buildCanonPrompt` (cross-video) → uses `framework-extraction-rubric` + archetype
4. `buildPerVideoCanonPrompt` → uses `framework-extraction-rubric` + archetype
5. `generateSynthesisNodes` → uses `cross-video-synthesis-rubric` + archetype
6. `generateReaderJourney` → uses `editorial-strategy-rubric` (journey-ladder section) + archetype
7. `buildBriefPrompt` → uses `editorial-strategy-rubric` + archetype

Replace each inlined prompt with the harness call. Existing user-message content (channel profile, VICs, etc.) becomes the user message; the SKILL.md content becomes the system message.

(The actual refactor code is mechanical: each `const prompt = [...].join('\n')` becomes `const systemPrompt = buildSystemPrompt({skill: '...', mode: 'extract', channelProfile: profile})` + a separate user message.)

- [ ] **Step 2: Add a regression test**

Run the audit pipeline against Hormozi (the same run) with the refactored code and verify the output is editorially equivalent (same canon nodes, same brief structure). Run with `--regen-canon --per-video-canon`. Verify the canon graph has the same ~24-30 framework canon nodes.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts .claude/skills/pipeline/
git commit -m "refactor(audit-seed): all 7 prompt sites use buildSystemPrompt(skill, mode, archetype)

The seed-audit-via-codex.ts file is now ~600 lines smaller. Editorial
standards live in .claude/skills/pipeline/*.md as the single source
of truth for both dev-time understanding and runtime prompts.

Regression test: re-running the Hormozi audit produces editorially
equivalent output (same canon node count, same brief catalog shape).

The pipeline now adapts archetype-specific prompts automatically based
on the channel profile, so the next creator (operator-coach,
science-explainer, instructional-craft, contemplative-thinker, or
_DEFAULT) gets appropriate examples without code changes."
```

## Task 2.5: Visual moments via Groq vision

**Files:**
- Create: `packages/pipeline/src/scripts/seed-visual-moments.ts`

**Why:** All Hormozi videos extracted 0 visual moments because the manual-upload path skipped frame extraction. Restoring this layer adds whiteboard captures, slide screenshots, and "Hormozi pointing at the supply curve" moments that make hub pages embed-rich. Groq has free vision (`llama-3.2-90b-vision-preview`).

- [ ] **Step 1: Create the script**

```ts
/**
 * Operator one-off: extract visual moments from the 6 manual-upload Hormozi
 * videos using ffmpeg + Groq vision. Mirrors the production visual_context
 * stage but uses the free Groq tier.
 *
 * Usage:
 *   tsx ./src/scripts/seed-visual-moments.ts <runId>
 *
 * For each video:
 *  1. Download the source MP4 from R2
 *  2. ffmpeg-sample frames every 10 seconds → ~50-60 frames per 10-min video
 *  3. For each frame, ask Groq vision: classify type, useful?, hubUse, score
 *  4. For frames with usefulnessScore >= 60, write a visual_moment row
 */

// (full implementation similar to existing visual-context.ts but using Groq client)
```

The full script is ~250 lines. Key decisions:
- Sample at 10-second intervals
- Send up to 50 frames per video (limit to avoid Groq rate limits)
- Filter by `usefulnessScore >= 60`
- Save the frame to R2 + the moment to `visual_moment` table
- Skip if frames already exist for the video (idempotent)

- [ ] **Step 2: Run for the Hormozi run**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/seed-visual-moments.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected: ~30-100 visual_moment rows added across the 6 videos.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/scripts/seed-visual-moments.ts
git commit -m "feat(visual-moments): Groq-vision frame extraction for manual uploads

Mirrors the production visual_context stage but uses Groq's free
llama-3.2-90b-vision-preview. ffmpeg samples frames at 10s
intervals, Groq classifies each, and frames with usefulnessScore
>= 60 are saved as visual_moment rows.

For the Hormozi run this adds ~30-100 visual moments where prior
runs had 0. Hub pages can now embed whiteboard captures, slide
screenshots, and key visual frames."
```

## Task 2.6: Citation-chain validator

**Files:**
- Create: `packages/pipeline/src/scripts/validate-citation-chain.ts`

**Why:** Every claim in canon nodes and briefs should trace to a real `segmentId`. A validator that walks the audit and emits a list of unsupported claims becomes the QA artifact a human editor signs.

- [ ] **Step 1: Create the validator**

```ts
/**
 * Citation-chain validator: walks all canon nodes + page briefs, extracts
 * every claim that references a segmentId, verifies the segment exists,
 * and emits a structured report of unsupported / orphaned / mis-attributed
 * citations.
 *
 * Output: a markdown report saved to /tmp/citation-validation-<runId>.md
 */
```

(Full implementation ~200 lines. Reads from canon/briefs, extracts UUIDs from prose, checks segment table, generates report.)

- [ ] **Step 2: Run + commit**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/validate-citation-chain.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
git add packages/pipeline/src/scripts/validate-citation-chain.ts
git commit -m "feat(qa): citation-chain validator for canon + brief outputs

Walks every claim and verifies its segmentId resolves. Emits a markdown
report listing unsupported, orphaned, and mis-attributed citations.
Becomes a key QA artifact for a human editor's pre-publish review."
```

## Task 2.7: Voice-fingerprint compliance checker

**Files:**
- Create: `packages/pipeline/src/scripts/check-voice-fingerprint.ts`

**Why:** Each brief has an `editorialStrategy.voiceFingerprint` (profanity rules, tone preset, terms-to-preserve). When page composition produces actual prose, we need a checker that scores compliance. For now, it scores the briefs themselves.

- [ ] **Step 1: Create the checker**

```ts
/**
 * Voice-fingerprint compliance checker: for each brief, compare the
 * editorial strategy's voiceFingerprint against the actual brief content
 * (audienceQuestion, openingHook). Score: % of preserveTerms used,
 * tone alignment estimate, profanity-rule compliance. Emit violations.
 */
```

(Full ~150 lines. Heuristic scoring based on phrase matching + length analysis.)

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/scripts/check-voice-fingerprint.ts
git commit -m "feat(qa): voice-fingerprint compliance checker for briefs

Scores how well each brief's actual prose (audienceQuestion +
openingHook) matches its declared voice fingerprint. Becomes part
of the pre-publish QA flow."
```

## Task 2.8: Offline stage cost tracking

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`
- Modify: `packages/pipeline/src/scripts/seed-reference-artifacts.ts`
- Modify: `packages/pipeline/src/scripts/seed-targeted-briefs.ts`
- Modify: `packages/pipeline/src/scripts/seed-targeted-canon.ts`

**Why:** The audit page's "Stage Cost Breakdown" section currently shows "_No stage cost data._" because offline scripts don't write `generation_stage_run` rows. Add it.

- [ ] **Step 1: Add a tiny helper**

Create `packages/pipeline/src/scripts/util/track-stage.ts`:

```ts
import crypto from 'node:crypto';
import { getDb } from '@creatorcanon/db';
import { generationStageRun } from '@creatorcanon/db/schema';

export async function trackStageRun(
  runId: string,
  workspaceId: string,
  stageName: string,
  costCents: number,
): Promise<void> {
  const db = getDb();
  await db.insert(generationStageRun).values({
    id: crypto.randomUUID(),
    workspaceId,
    runId,
    stageName,
    inputHash: 'offline',
    pipelineVersion: 'canon_v1',
    status: 'success',
    costCents: costCents.toFixed(4),
    startedAt: new Date(),
    completedAt: new Date(),
  } as Record<string, unknown>);
}
```

- [ ] **Step 2: Wire it into each offline script's main()**

After each major stage completes (canon, synthesis, journey, briefs, reference artifacts), call `trackStageRun(runId, workspaceId, 'stage_name', 0)`. The cost is 0 (Codex CLI is free) but the rows make the audit page's stage breakdown render.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/scripts/util/track-stage.ts packages/pipeline/src/scripts/*.ts
git commit -m "feat(audit-seed): track offline stage runs for audit page cost breakdown

Each offline script now writes generation_stage_run rows so the audit
page's Stage Cost Breakdown section shows the work done. Cost is 0
cents (Codex CLI is free against ChatGPT plan) but the rows make
the section render."
```

## Task 2.9: Phase 2 verification + STOP gate

- [ ] **Step 1: Re-run Hormozi audit with skill-driven path**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/seed-audit-via-codex.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b --regen-canon --per-video-canon --regen-synthesis --regen-briefs
```

Verify the output is editorially equivalent to Phase 1.5/1.6 (same quality, same canon coverage).

- [ ] **Step 2: Run citation-chain validator + voice fingerprint checker**

```bash
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/validate-citation-chain.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
cd packages/pipeline && ./node_modules/.bin/tsx ./src/scripts/check-voice-fingerprint.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Review the reports.

- [ ] **Step 3: STOP — User review of Phase 2**

Audit at ~99% agency-ready. Hormozi run uses skill-driven prompts. Visual moments now exist. Citation chain + voice fingerprint reports add QA dimension.

If approved → continue to Phase 3.

---

# Phase 3 — Production Polish + Portability (target 100%)

## Task 3.1: QA worksheet generator

**Files:**
- Create: `packages/pipeline/src/scripts/generate-qa-worksheet.ts`

**Why:** A real agency hands the human editor a checklist that's pre-filled with sampled spot-checks, voice compliance, citation samples, and CTA validation. This becomes the "human editorial QA pass" artifact.

- [ ] **Step 1: Create the worksheet generator**

The script:
1. Samples 10 random claims across canon + briefs
2. For each, finds the cited segmentId and the segment's text
3. Generates checkbox items: "Claim X states Y; segment at [m:ss] says: Z. Does the claim accurately summarize the segment? [ ] yes [ ] no"
4. Adds 3 voice-compliance prompts: "Read brief X aloud. Does it sound like Hormozi? [ ] yes [ ] no [ ] needs editing"
5. Adds cluster topology check: "Cluster A has 6 spokes pointing at parent X. Does the architecture make sense as navigation? [ ] yes [ ] no"
6. Adds CTA validation: "Brief X's CTA is 'Y'. Is this aligned with the channel's monetization angle? [ ] yes [ ] no"
7. Renders to a markdown file the human signs at the bottom

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/scripts/generate-qa-worksheet.ts
git commit -m "feat(qa): worksheet generator for human pre-publish review

Auto-generates a markdown checklist a human editor signs:
- 10 sampled claim → segment verifications
- 3 voice-compliance spot checks
- Cluster topology architecture review
- CTA validation per brief

Becomes the final QA artifact before a hub goes to print."
```

## Task 3.2: Generic creator-onboarding script

**Files:**
- Create: `packages/pipeline/src/scripts/onboard-creator.ts`

**Why:** Replaces the hardcoded `link-uploads-to-youtube.ts` MAPPINGS array with a generic onboarding flow. Takes a CSV/JSON config of `{title, mp4Path, youtubeUrl}` rows + workspace/user IDs and runs the entire pipeline end-to-end (upload, transcribe, audit, generate).

- [ ] **Step 1: Create the script**

```ts
// Reads a creator config file (JSON):
// {
//   "creator": "Andrew Huberman",
//   "workspaceId": "...",
//   "userId": "...",
//   "channelId": "ch_uploads_...",
//   "videos": [
//     { "title": "...", "mp4Path": "...", "youtubeUrl": "https://..." },
//     ...
//   ]
// }
// Then runs: upload → transcribe → audit → reference-artifacts → done
```

- [ ] **Step 2: Document the format + commit**

```bash
git add packages/pipeline/src/scripts/onboard-creator.ts
git commit -m "feat(productize): generic creator-onboarding script

Replaces the hardcoded Hormozi mappings with a config-driven
onboarding flow. JSON config specifies videos + YouTube URLs;
script runs upload → transcribe → audit → reference-artifacts
end to end.

For the next creator hub, the only per-creator work is editing
the JSON config."
```

## Task 3.3: Sibling-slug reconciliation pass

**Files:**
- Create: `packages/pipeline/src/scripts/reconcile-sibling-slugs.ts`

**Why:** When briefs are generated iteratively, each brief's `editorialStrategy.clusterRole.siblingSlugs` is Codex's best guess at the time. After all briefs are written, we can do a second pass to reconcile siblings based on the actual cluster topology (briefs that share a `parentTopic` are each other's siblings).

- [ ] **Step 1: Create the reconciler**

```ts
// 1. Load all briefs for runId
// 2. Group by editorialStrategy.clusterRole.parentTopic
// 3. For each group, set every brief's siblingSlugs = [other briefs' slugs in same group]
// 4. UPDATE pageBrief.payload with the reconciled strategy
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/scripts/reconcile-sibling-slugs.ts
git commit -m "feat(briefs): sibling-slug reconciliation pass after iteration

Each brief's clusterRole.siblingSlugs is Codex's best guess at the
time. This second pass groups briefs by parentTopic and fills in
the actual siblings. Run it after all briefs are written."
```

## Task 3.4: Wire skill-driven path into production canon_v1 pipeline

**Files:**
- Modify: `packages/pipeline/src/dispatch-queued-run.ts`
- Modify: `packages/pipeline/src/run-generation-pipeline.ts`

**Why:** Currently the offline scripts ARE the canon_v1 audit phase. To productize, we wire them into the harness so the production pipeline (the one called by the dispatch script) uses the skill-driven path instead of the OpenAI/Gemini tool-using agents that hit quota walls.

- [ ] **Step 1: Add a `PIPELINE_AUDIT_PATH` env flag**

When set to `'skill-driven'`, the audit phase calls the offline-script generators (refactored as importable functions). When unset, it uses the original tool-using path.

- [ ] **Step 2: Integration test**

Run a fresh end-to-end pipeline with `PIPELINE_AUDIT_PATH=skill-driven` and verify it lands at `audit_ready` with the same quality as the offline scripts produced.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/dispatch-queued-run.ts packages/pipeline/src/run-generation-pipeline.ts
git commit -m "feat(pipeline): skill-driven audit path opt-in via PIPELINE_AUDIT_PATH

When PIPELINE_AUDIT_PATH=skill-driven, the audit phase uses Codex
CLI + skill-driven prompts instead of the OpenAI/Gemini tool-using
agents. Eliminates the quota wall on tool-using agents and enables
$0-cost dev iteration end-to-end.

The original tool-using path stays as default for any operator
who wants the full structured-output guarantee from function-calling."
```

## Task 3.5: End-to-end smoke test against a non-Hormozi creator

**Files:** none (this is a verification task)

**Why:** Validate that the pipeline genuinely works for a different archetype. The user provides 4-6 videos from a different creator (e.g. Huberman, Joshua Weissman) and we run the entire flow end-to-end.

- [ ] **Step 1: User selects + uploads a non-Hormozi creator's videos**

(User-provided. Could be any of: Huberman lab podcast, Joshua Weissman recipes, Sam Harris meditations, etc.)

- [ ] **Step 2: Run onboard-creator.ts**

```bash
./node_modules/.bin/tsx ./src/scripts/onboard-creator.ts ./creator-configs/huberman.json
```

The script:
1. Uploads MP4s to R2
2. Transcribes via Groq
3. Runs `seed-audit-via-codex.ts --per-video-canon` (the skill-driven path auto-detects the archetype as `science-explainer`)
4. Runs reference artifacts
5. Runs targeted briefs if needed
6. Runs visual-moments
7. Runs validators
8. Runs QA worksheet generator

- [ ] **Step 3: User reviews the resulting audit**

Verify:
- Channel profile correctly reads "neuroscientist" / "evidence-based" / "mechanism-first"
- Archetype detected as `science-explainer`
- Canon nodes use mechanism-first language (not "cashflow-first")
- Synthesis nodes thread the science archetype examples
- Reader Journey uses science-archetype phases (e.g., "Curious → Mechanism → Practice → Optimization → Mastery") not Hormozi's survival-to-investing
- Briefs cover lesson/research/practice pillars (not money/sales/pricing)

- [ ] **Step 4: STOP — User signs off**

Pipeline is now provably creator-portable.

---

## Self-Review

**Spec coverage:** Each gap from the Phase 1.5 final audit is addressed:

1. AI-skewed brief catalog → Task 1.6.1 (targeted briefs for missing pillars)
2. Top 10% Learning Loop missing canon node → Task 1.6.2 (targeted canon)
3. Bare ms-range citations → Task 1.6.3 (VIC prompt tweak)
4. Hormozi-flavored prompt examples → Tasks 2.1-2.4 (skill extraction)
5. Visual moments missing → Task 2.5 (Groq vision)
6. No citation-chain validator → Task 2.6
7. No voice-fingerprint compliance → Task 2.7
8. Stage cost breakdown empty → Task 2.8
9. No human QA worksheet → Task 3.1
10. Hardcoded creator scaffolding → Task 3.2 (onboard-creator.ts)
11. Sibling slug guesses unreconciled → Task 3.3
12. Skill-driven path not wired into prod → Task 3.4
13. Cross-creator portability untested → Task 3.5 (Huberman / non-Hormozi smoke)

**Placeholders:** None on the implementation tasks. The skill-file content (Task 2.1, 2.2) is described structurally with format spec; the actual rubric content is ~150-300 lines of markdown per skill that gets authored during execution.

**Type consistency:** `PageBriefOut.editorialStrategy`, `CanonNodeOut`, `SynthesisNodeOut`, `ReaderJourneyOut` shapes preserved across the refactor. `ParsedSkill`, `ArchetypeSlug`, `BuildSystemPromptInput` are new types that compose cleanly with existing types.

**Idempotency:** Every offline script remains re-runnable. Targeted scripts skip already-existing rows by title/slug match. Skill-driven path doesn't change DB shape. Onboard-creator can resume from any partial state.

**Quota safety:** Zero new OpenAI/Gemini calls in any phase. Phase 2 vision uses Groq (free tier). All LLM work via Codex CLI.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-hormozi-audit-to-100-pct-and-portable.md`. Three execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per code task, with batched comprehensive code review at each stop gate (1.6 → 2 → 3). Mirrors the user's Phase 1 + 1.5 working style.

**2. Inline Execution** — implement tasks in this session.

**3. Phase-by-phase with explicit user review at each stop gate** — Phase 1.6 first (~3 hours), then user reviews and approves Phase 2, etc.

I recommend option 3 with subagent-driven within each phase. The natural stop gates are:
- After Phase 1.6: user reviews 95% audit
- After Phase 2: user reviews 99% audit + first non-Hormozi smoke test setup
- After Phase 3: user signs off on full portability

**Which approach?**
