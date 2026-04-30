# Phase 1.7 — Hormozi Audit Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 8 structural gaps in the Hormozi audit (run `037458ae-1439-4e56-a8da-aa967f2f5e1b`) discovered during the deep audit-the-audit pass, taking the run from honest ~88-90% to 95%+.

**Architecture:** Six small one-off scripts under `packages/pipeline/src/scripts` that operate idempotently on already-persisted DB rows. No schema migrations except Task 1's optional unique index. Tasks 1-3 are pure deterministic SQL/JS. Tasks 4-6 use Codex CLI (free tier) for LLM-driven content updates. Each script preserves IDs and is safe to re-run.

**Tech Stack:** TypeScript, Drizzle ORM, Codex CLI v0.125.0, Postgres (Neon), Cloudflare R2.

**Run scope:** All work targets runId `037458ae-1439-4e56-a8da-aa967f2f5e1b` (Hormozi audit, status `audit_ready`).

---

## Audit-discovered gaps this plan closes

1. 4 floating pillars + 16 spokes parented to non-existent thesis slugs (cluster topology)
2. 5% canon citation density (2 of 36 nodes embed valid segmentIds)
3. 5 of 6 VICs still use `[123ms-456ms]` ranges instead of `[segmentId]`
4. 9 duplicate visual_moment rows (failed-run residue)
5. Duplicate stage_run rows: `channel_profile` ×2, `visual_context` ×2
6. Stale `video_intelligence: failed_terminal` stage row from Phase 1
7. Brief positions inconsistent: 1×7, 6, 7, 9-12, 113-119
8. (Carried forward) `evidenceQuality: high` is a default on 100% of nodes — left as-is for Phase 2's validators

---

### Task 1: Visual moment dedup

**Why:** 26 rows in DB but only 17 unique `(videoId, timestampMs)` pairs. The 9 duplicates inflate the audit's "Visual Moments" count and double-render images for Video 1.

**Files:**
- Create: `packages/pipeline/src/scripts/dedup-visual-moments.ts`
- Optional migration: `packages/db/drizzle/<next>_visual_moment_unique.sql` (deferred — leave as code-level guard via the existing seed script)

- [ ] **Step 1: Write `dedup-visual-moments.ts`**

```ts
/**
 * Operator one-off: remove duplicate visual_moment rows that resulted from
 * earlier failed Groq-vision runs writing rows before being killed. Keeps
 * the lowest UUID id per (runId, videoId, timestampMs) tuple, deletes
 * the rest. Logs how many rows were removed.
 *
 * Usage:
 *   tsx ./src/scripts/dedup-visual-moments.ts <runId>
 */
import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import { visualMoment } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/dedup-visual-moments.ts <runId>');

  const db = getDb();
  const before = await db.select({ c: sql<number>`count(*)::int` }).from(visualMoment).where(eq(visualMoment.runId, runId));
  console.info(`[dedup-vm] before: ${before[0]?.c ?? 0} rows`);

  // Delete rows whose id is NOT the minimum id within their (runId, videoId, timestampMs) group.
  const deleted = await db.execute(sql`
    DELETE FROM visual_moment
    WHERE run_id = ${runId}
    AND id NOT IN (
      SELECT MIN(id)
      FROM visual_moment
      WHERE run_id = ${runId}
      GROUP BY video_id, timestamp_ms
    )
    RETURNING id
  `);
  // drizzle .execute returns { rows } on Postgres
  const removedCount = (deleted as unknown as { rows: unknown[] }).rows.length;

  const after = await db.select({ c: sql<number>`count(*)::int` }).from(visualMoment).where(eq(visualMoment.runId, runId));
  console.info(`[dedup-vm] removed: ${removedCount} rows · after: ${after[0]?.c ?? 0} rows`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[dedup-vm] FAILED', e); process.exit(1); });
```

- [ ] **Step 2: Run against the Hormozi run**

```bash
cd packages/pipeline
./node_modules/.bin/tsx ./src/scripts/dedup-visual-moments.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected output: `before: 26 rows · removed: 9 rows · after: 17 rows`

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/scripts/dedup-visual-moments.ts
git commit -m "chore(audit-cleanup): dedup visual_moment rows from failed-run residue"
```

---

### Task 2: Stage run cleanup

**Why:** `channel_profile` and `visual_context` have duplicate rows (one with real `durationMs`, one with 0 from backfill). A stale `video_intelligence: failed_terminal` row from the original Phase 1 dispatch is still in the table — audit page renders it as a failed stage even though all 6 per-video VICs succeeded.

**Files:**
- Create: `packages/pipeline/src/scripts/cleanup-stage-runs.ts`

- [ ] **Step 1: Write `cleanup-stage-runs.ts`**

```ts
/**
 * Operator one-off: remove stage-run residue from earlier failed dispatches
 * and consolidate duplicate rows from the offline backfill pass.
 *
 * Removes:
 *   - Any row where status='failed_terminal' AND stage_name='video_intelligence'
 *     (Phase 1 dispatch failure — superseded by per-video success rows)
 *   - For each (runId, stageName) pair with multiple rows, keep the one with
 *     the largest durationMs (i.e., the original real-timing run); drop the
 *     0-duration backfill phantoms.
 *
 * Usage:
 *   tsx ./src/scripts/cleanup-stage-runs.ts <runId>
 */
import { and, closeDb, eq, getDb, sql } from '@creatorcanon/db';
import { generationStageRun } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/cleanup-stage-runs.ts <runId>');

  const db = getDb();
  const before = await db.select().from(generationStageRun).where(eq(generationStageRun.runId, runId));
  console.info(`[cleanup-stages] before: ${before.length} rows`);

  // (a) Drop stale failed_terminal video_intelligence rows.
  const failedRemoved = await db.execute(sql`
    DELETE FROM generation_stage_run
    WHERE run_id = ${runId}
    AND stage_name = 'video_intelligence'
    AND status = 'failed_terminal'
    RETURNING id
  `);
  const failedCount = (failedRemoved as unknown as { rows: unknown[] }).rows.length;
  console.info(`[cleanup-stages] removed failed_terminal rows: ${failedCount}`);

  // (b) For each (runId, stageName) with >1 succeeded rows, keep only the
  // one with the largest duration_ms.
  const dupRemoved = await db.execute(sql`
    DELETE FROM generation_stage_run
    WHERE run_id = ${runId}
    AND id NOT IN (
      SELECT DISTINCT ON (run_id, stage_name) id
      FROM generation_stage_run
      WHERE run_id = ${runId}
      ORDER BY run_id, stage_name, duration_ms DESC, started_at DESC
    )
    RETURNING id
  `);
  const dupCount = (dupRemoved as unknown as { rows: unknown[] }).rows.length;
  console.info(`[cleanup-stages] removed duplicate rows: ${dupCount}`);

  const after = await db.select().from(generationStageRun).where(eq(generationStageRun.runId, runId));
  console.info(`[cleanup-stages] after: ${after.length} rows`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[cleanup-stages] FAILED', e); process.exit(1); });
```

- [ ] **Step 2: Run against the Hormozi run**

```bash
cd packages/pipeline
./node_modules/.bin/tsx ./src/scripts/cleanup-stage-runs.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected output: `before: 20 rows · removed failed_terminal rows: 1 · removed duplicate rows: 2 · after: 17 rows`

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/scripts/cleanup-stage-runs.ts
git commit -m "chore(audit-cleanup): drop stale + duplicate generation_stage_run rows"
```

---

### Task 3: Brief position normalization

**Why:** Positions are 1×7 (multiple briefs share `position=1`), 6, 7, 9-12, 113-119. Render order on the audit page is incoherent.

**Canonical order:** pillars first (alphabetical by slug), then spokes grouped by `parentTopic` (alphabetical by parent, then alphabetical by spoke slug). 1-indexed.

**Files:**
- Create: `packages/pipeline/src/scripts/normalize-brief-positions.ts`

- [ ] **Step 1: Write `normalize-brief-positions.ts`**

```ts
/**
 * Operator one-off: reassign page_brief.position to a clean 1..N sequence,
 * pillars first by slug, then spokes grouped by parent (alphabetical) and
 * by spoke slug within each group.
 *
 * Usage:
 *   tsx ./src/scripts/normalize-brief-positions.ts <runId>
 */
import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface BriefRow {
  id: string;
  payload: {
    slug?: string;
    editorialStrategy?: { clusterRole?: { tier?: string; parentTopic?: string | null } };
  };
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/normalize-brief-positions.ts <runId>');

  const db = getDb();
  const rows = (await db.select({ id: pageBrief.id, payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, runId))) as BriefRow[];
  if (rows.length === 0) throw new Error(`No briefs found for run ${runId}`);

  // Sort: pillars first by slug, then spokes by (parentTopic, slug).
  const sorted = [...rows].sort((a, b) => {
    const ar = a.payload.editorialStrategy?.clusterRole;
    const br = b.payload.editorialStrategy?.clusterRole;
    const aIsPillar = ar?.tier === 'pillar' ? 0 : 1;
    const bIsPillar = br?.tier === 'pillar' ? 0 : 1;
    if (aIsPillar !== bIsPillar) return aIsPillar - bIsPillar;
    if (aIsPillar === 1) {
      // both spokes — group by parent then slug
      const ap = ar?.parentTopic ?? '';
      const bp = br?.parentTopic ?? '';
      if (ap !== bp) return ap.localeCompare(bp);
    }
    return (a.payload.slug ?? '').localeCompare(b.payload.slug ?? '');
  });

  for (let i = 0; i < sorted.length; i += 1) {
    const newPos = i + 1;
    await db.update(pageBrief).set({ position: newPos }).where(eq(pageBrief.id, sorted[i]!.id));
  }

  // Verify
  const after = await db.select({ id: pageBrief.id, position: pageBrief.position, payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, runId)).orderBy(asc(pageBrief.position));
  for (const b of after) {
    const p = b.payload as BriefRow['payload'];
    const tier = p.editorialStrategy?.clusterRole?.tier ?? '?';
    console.info(`[normalize-pos] #${b.position} [${tier}] ${p.slug}`);
  }
  console.info(`[normalize-pos] DONE — ${after.length} briefs renumbered`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[normalize-pos] FAILED', e); process.exit(1); });
```

- [ ] **Step 2: Run against the Hormozi run**

```bash
cd packages/pipeline
./node_modules/.bin/tsx ./src/scripts/normalize-brief-positions.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected output: 20 lines `#1 [pillar] slug=...`, ascending positions 1-20.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/scripts/normalize-brief-positions.ts
git commit -m "chore(audit-cleanup): normalize page_brief.position to 1..N"
```

---

### Task 4: Generate 3 thesis-pillar briefs + reconcile cluster topology

**Why:** 16 spokes currently parent to thesis slugs (`ai-is-leverage-after-judgment`, `cashflow-before-scale`, `discomfort-is-the-admission-price`) that have NO corresponding pillar brief. Generate three new pillar briefs — one per thesis — using the matching synthesis canon node as the editorial source. Then re-run the existing `reconcile-sibling-slugs.ts` so siblings update.

**The 3 missing pillars (slug → synthesis canon node title):**
- `ai-is-leverage-after-judgment` → "AI Is Leverage After Judgment"
- `cashflow-before-scale` → (look up synthesis canon node)
- `discomfort-is-the-admission-price` → (look up synthesis canon node)

**Files:**
- Create: `packages/pipeline/src/scripts/seed-thesis-pillars.ts`

- [ ] **Step 1: Confirm the synthesis canon node IDs for the 3 thesis slugs**

```bash
cd packages/pipeline
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const RUN = '037458ae-1439-4e56-a8da-aa967f2f5e1b';
  const nodes = await db.select().from(canonNode).where(eq(canonNode.runId, RUN));
  const synth = nodes.filter(n => (n.payload as any)?.kind === 'synthesis');
  for (const s of synth) console.log(s.id, '·', (s.payload as any).title);
  await closeDb();
})();
"
```

Capture the 5 synthesis IDs and titles. Three of them will match the cluster slugs.

- [ ] **Step 2: Write `seed-thesis-pillars.ts`**

This script: (a) reads the channel profile + the named synthesis canon node + the canon graph, (b) calls Codex to produce a single pillar brief whose slug matches the cluster's parentTopic value, (c) inserts it into `page_brief` with a unique id and position 0 (will be normalized later by Task 3 — re-run if needed).

Reuse the Codex tmpFile-race-safe pattern from `seed-targeted-briefs.ts`:

```ts
/**
 * Operator one-off: generate pillar briefs for 3 thesis slugs that the
 * cluster topology references but which currently have no matching brief.
 * Each thesis is anchored on a synthesis canon node; we feed Codex the
 * channel profile + synthesis node + adjacent canon nodes, and ask for one
 * pillar brief whose slug == thesis slug.
 *
 * Usage:
 *   tsx ./src/scripts/seed-thesis-pillars.ts <runId>
 *
 * The thesis slugs and matching synthesis node titles are hardcoded for
 * the Hormozi run — generalize when the second creator lands.
 */

import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { and, closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, channelProfile, pageBrief } from '@creatorcanon/db/schema';

import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const CODEX_BINARY = process.platform === 'win32' ? 'codex.cmd' : 'codex';
const CODEX_TIMEOUT_MS = 5 * 60 * 1000;

const THESIS_PILLARS: Array<{ slug: string; titleHint: string }> = [
  { slug: 'ai-is-leverage-after-judgment', titleHint: 'AI Is Leverage After Judgment' },
  { slug: 'cashflow-before-scale', titleHint: 'Cashflow Before Scale' },
  { slug: 'discomfort-is-the-admission-price', titleHint: 'Discomfort Is The Admission Price' },
];

async function runCodex(prompt: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-thesis-'));
  const tmpFile = path.join(tmpDir, 'out.txt');
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (cb: () => void) => { if (settled) return; settled = true; try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} cb(); };
    const proc = spawn(CODEX_BINARY, ['exec', '--skip-git-repo-check', '-o', tmpFile], { stdio: ['pipe', 'ignore', 'pipe'], env: process.env, shell: process.platform === 'win32' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    if (proc.stdin) { proc.stdin.on('error', () => {}); proc.stdin.write(prompt); proc.stdin.end(); }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} settle(() => reject(new Error(`codex timed out`))); }, CODEX_TIMEOUT_MS);
    proc.on('error', (err) => { clearTimeout(timer); settle(() => reject(new Error(`codex spawn failed: ${err.message}`))); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`))); return; }
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
  if (!cp[0]) throw new Error('No channel profile');
  const profile = cp[0].payload;

  const allCanon = await db.select().from(canonNode).where(eq(canonNode.runId, runId));
  const synthesis = allCanon.filter((n) => (n.payload as { kind?: string })?.kind === 'synthesis');

  const existing = await db.select({ payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, runId));
  const existingSlugs = new Set(existing.map((b) => (b.payload as { slug?: string }).slug ?? ''));

  for (const t of THESIS_PILLARS) {
    if (existingSlugs.has(t.slug)) {
      console.info(`[thesis-pillars] ${t.slug}: already exists, skipping`);
      continue;
    }
    // Find the synthesis canon node whose title best matches.
    const synth = synthesis.find((n) => {
      const title = ((n.payload as { title?: string }).title ?? '').toLowerCase();
      return title.includes(t.titleHint.toLowerCase().split(' ')[0]!) && title.includes(t.titleHint.toLowerCase().split(' ').slice(-1)[0]!);
    });
    if (!synth) {
      console.warn(`[thesis-pillars] ${t.slug}: no synthesis canon node matches "${t.titleHint}"; skipping`);
      continue;
    }

    const prompt = [
      'You are page_planner. Produce ONE pillar-tier hub-page brief for a thesis.',
      '',
      '# Channel profile',
      JSON.stringify(profile, null, 2),
      '',
      '# Anchor synthesis canon node (this is the thesis)',
      JSON.stringify(synth.payload, null, 2),
      '',
      '# Adjacent canon nodes (for sectional content)',
      JSON.stringify(allCanon.slice(0, 30).map((n) => ({ id: n.id, type: n.type, title: (n.payload as { title?: string }).title })), null, 2),
      '',
      '# REQUIREMENTS',
      `- Output a single JSON object representing one brief whose slug is EXACTLY: "${t.slug}"`,
      '- pageType: "thesis"',
      '- Include editorialStrategy.clusterRole = { tier: "pillar", parentTopic: null, siblingSlugs: [] }',
      '- siblingSlugs will be filled by reconcile-sibling-slugs.ts later — leave empty.',
      '- 4-section outline, each with intent, sectionTitle, canonNodeIds (3-5 IDs from the canon graph)',
      '- Include persona, cta, seo, voiceFingerprint, journeyPhase, openingHook, audienceQuestion, pageWorthinessScore (>=92)',
      '- Match the channel\'s blunt-tactical voice with profanity allowed',
      '',
      '# OUTPUT FORMAT — return ONLY the JSON object, no fences, no commentary.',
    ].join('\n');

    console.info(`[thesis-pillars] generating ${t.slug}…`);
    const raw = await runCodex(prompt);
    const briefJson = extractJsonFromCodexOutput(raw);
    if (!briefJson) {
      console.error(`[thesis-pillars] ${t.slug}: failed to extract JSON from Codex`);
      continue;
    }

    // Force the slug + clusterRole shape regardless of what Codex returned.
    const brief = briefJson as Record<string, unknown>;
    brief.slug = t.slug;
    const es = (brief.editorialStrategy ?? {}) as Record<string, unknown>;
    es.clusterRole = { tier: 'pillar', parentTopic: null, siblingSlugs: [] };
    brief.editorialStrategy = es;

    await db.insert(pageBrief).values({
      id: crypto.randomUUID(),
      workspaceId: cp[0].workspaceId,
      runId,
      position: 0,
      payload: brief as Record<string, unknown>,
    });
    console.info(`[thesis-pillars] ${t.slug}: inserted (position=0, normalize-brief-positions will fix)`);
  }
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[thesis-pillars] FAILED', e); process.exit(1); });
```

- [ ] **Step 3: Run the thesis-pillar generator**

```bash
cd packages/pipeline
./node_modules/.bin/tsx ./src/scripts/seed-thesis-pillars.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected output: 3 lines `[thesis-pillars] <slug>: inserted`. (After 1-3 minutes per pillar.)

- [ ] **Step 4: Re-run the existing reconcile-sibling-slugs script**

```bash
./node_modules/.bin/tsx ./src/scripts/reconcile-sibling-slugs.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected: each thesis cluster now has 7 members (1 pillar + 6 spokes). Pillar's siblings = the 5 other pillars.

- [ ] **Step 5: Re-run brief position normalization to position the new pillars**

```bash
./node_modules/.bin/tsx ./src/scripts/normalize-brief-positions.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

- [ ] **Step 6: Verify pillar↔spoke wiring**

```bash
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const briefs = await db.select({ payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, '037458ae-1439-4e56-a8da-aa967f2f5e1b')).orderBy(asc(pageBrief.position));
  const pillarSlugs = new Set(briefs.filter(b => (b.payload as any)?.editorialStrategy?.clusterRole?.tier === 'pillar').map(b => (b.payload as any).slug));
  let orphanSpokes = 0;
  for (const b of briefs) {
    const cr = (b.payload as any)?.editorialStrategy?.clusterRole;
    if (cr?.tier === 'spoke' && !pillarSlugs.has(cr.parentTopic) && cr.parentTopic) orphanSpokes++;
  }
  console.log('Total pillars:', pillarSlugs.size);
  console.log('Orphan spokes (parent missing as pillar slug):', orphanSpokes);
  await closeDb();
})();
"
```

Expected: `Total pillars: 7 · Orphan spokes: 0`

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/src/scripts/seed-thesis-pillars.ts
git commit -m "feat(audit-cleanup): generate 3 thesis-pillar briefs to anchor spoke clusters"
```

---

### Task 5: Embed segmentId citations into 34 canon nodes

**Why:** 34 of 36 canon nodes (synthesis, framework, references) make claims with no clickable source. Re-issue each through Codex with the original payload + all 6 VICs + all transcript segments, asking for the same content with `[segmentId]` citations inserted after each citable claim. Preserve all existing fields verbatim except where citations belong.

**Files:**
- Create: `packages/pipeline/src/scripts/seed-canon-citations.ts`

- [ ] **Step 1: Confirm which canon nodes need citations**

```bash
cd packages/pipeline
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, segment } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const RUN = '037458ae-1439-4e56-a8da-aa967f2f5e1b';
  const db = getDb();
  const segs = await db.select({ id: segment.id }).from(segment).where(eq(segment.runId, RUN));
  const segIds = new Set(segs.map(s => s.id));
  const nodes = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, RUN));
  const uuidPat = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  const needCitations: string[] = [];
  for (const n of nodes) {
    const j = JSON.stringify(n.payload);
    const matches = j.match(uuidPat) ?? [];
    const validRefs = matches.filter(id => segIds.has(id));
    if (validRefs.length === 0) needCitations.push(n.id);
  }
  console.log('Need citations:', needCitations.length, '/', nodes.length);
  await closeDb();
})();
"
```

Expected: `Need citations: 34 / 36`

- [ ] **Step 2: Write `seed-canon-citations.ts`**

This is the long-tail script — 34 Codex calls at ~1 minute each ≈ 35 minutes. Each call updates one canon node's payload in place, embedding `[segmentId]` after citable claims, leaving structure unchanged.

```ts
/**
 * Operator one-off: for each canon node lacking valid segmentId citations,
 * re-issue through Codex with the existing payload + all 6 VICs + all
 * transcript segments. Codex returns the same payload structure with
 * `[segmentId]` tokens inserted inline after citable claims.
 *
 * Usage:
 *   tsx ./src/scripts/seed-canon-citations.ts <runId>
 *
 * Idempotent: nodes already containing valid segmentId references are skipped.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { canonNode, segment, videoIntelligenceCard, video } from '@creatorcanon/db/schema';

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
    const settle = (cb: () => void) => { if (settled) return; settled = true; try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} cb(); };
    const proc = spawn(CODEX_BINARY, ['exec', '--skip-git-repo-check', '-o', tmpFile], { stdio: ['pipe', 'ignore', 'pipe'], env: process.env, shell: process.platform === 'win32' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    if (proc.stdin) { proc.stdin.on('error', () => {}); proc.stdin.write(prompt); proc.stdin.end(); }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} settle(() => reject(new Error('codex timed out'))); }, CODEX_TIMEOUT_MS);
    proc.on('error', (err) => { clearTimeout(timer); settle(() => reject(new Error(`codex spawn failed: ${err.message}`))); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`))); return; }
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
  const segs = await db.select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, text: segment.text }).from(segment).where(eq(segment.runId, runId)).orderBy(asc(segment.videoId), asc(segment.startMs));
  const segIds = new Set(segs.map((s) => s.id));
  const nodes = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, runId));
  const uuidPat = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  const needsCitation = nodes.filter((n) => {
    const matches = (JSON.stringify(n.payload).match(uuidPat) ?? []).filter((id) => segIds.has(id));
    return matches.length === 0;
  });
  console.info(`[canon-cite] ${needsCitation.length}/${nodes.length} canon nodes need citations`);

  // Build a compact transcript block grouped by video.
  const segmentBlock = segs.map((s) => `[${s.id}] ${s.text}`).join('\n');

  let updated = 0;
  for (const n of needsCitation) {
    const prompt = [
      'You are citation_editor. Take a canon node payload and embed [segmentId] citations inline after every citable claim.',
      '',
      '# RULES',
      '- Preserve every field, key, structure, and value EXACTLY as given.',
      '- Insert citation tokens of the form [<segmentId>] inline AFTER each claim that paraphrases or summarizes a transcript segment.',
      '- Use ONLY segmentIds from the transcript block below. NEVER fabricate IDs.',
      '- Each citable claim should have 1-3 segmentId citations.',
      '- Do NOT touch fields that are obviously meta (title, kind, type, score, count fields).',
      '- Citable fields include: summary, definition, whyItMatters, whenToUse, whenNotToUse, commonMistake, successSignal, sequencingRationale, examples (each item), steps (each item), failureModes (each item), preconditions (each item), quotes (each item), unifyingThread.',
      '',
      '# TRANSCRIPT (every segment from the run)',
      segmentBlock,
      '',
      '# CANON NODE PAYLOAD TO ANNOTATE',
      JSON.stringify(n.payload, null, 2),
      '',
      '# OUTPUT FORMAT — return ONLY the annotated JSON object, same structure, with citations inserted inline. No fences, no commentary.',
    ].join('\n');

    try {
      const raw = await runCodex(prompt);
      const annotated = extractJsonFromCodexOutput(raw);
      if (!annotated) { console.warn(`[canon-cite] ${n.id}: failed to extract JSON; skipping`); continue; }

      // Sanity check: the annotated payload must contain at least 1 valid segmentId.
      const annotatedJson = JSON.stringify(annotated);
      const matches = (annotatedJson.match(uuidPat) ?? []).filter((id) => segIds.has(id));
      if (matches.length === 0) { console.warn(`[canon-cite] ${n.id}: no valid segmentIds embedded; skipping update`); continue; }

      await db.update(canonNode).set({ payload: annotated as Record<string, unknown> }).where(eq(canonNode.id, n.id));
      updated += 1;
      console.info(`[canon-cite] ${n.id}: ${matches.length} citations embedded`);
    } catch (err) {
      console.warn(`[canon-cite] ${n.id}: error ${(err as Error).message.slice(0, 200)}`);
    }
  }
  console.info(`[canon-cite] DONE — updated ${updated}/${needsCitation.length}`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[canon-cite] FAILED', e); process.exit(1); });
```

- [ ] **Step 3: Run against the Hormozi run**

```bash
./node_modules/.bin/tsx ./src/scripts/seed-canon-citations.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

This runs ~35 minutes. Expected: `updated 30+/34` (Codex may decline a few short reference nodes that have no citable claims — that's fine).

- [ ] **Step 4: Verify citation density**

```bash
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, segment } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const RUN = '037458ae-1439-4e56-a8da-aa967f2f5e1b';
  const db = getDb();
  const segs = await db.select({ id: segment.id }).from(segment).where(eq(segment.runId, RUN));
  const segIds = new Set(segs.map(s => s.id));
  const nodes = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, RUN));
  const uuidPat = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  let withCit = 0, totalCit = 0;
  for (const n of nodes) {
    const valid = (JSON.stringify(n.payload).match(uuidPat) ?? []).filter(id => segIds.has(id));
    if (valid.length > 0) { withCit++; totalCit += valid.length; }
  }
  console.log(\`Nodes with citations: \${withCit}/\${nodes.length}\`);
  console.log(\`Total citations: \${totalCit}\`);
  await closeDb();
})();
"
```

Expected: `Nodes with citations: 30+/36 · Total citations: 100+`

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/scripts/seed-canon-citations.ts
git commit -m "feat(audit-cleanup): backfill segmentId citations into canon node payloads"
```

---

### Task 6: Regenerate 5 VICs with segmentId-first prompt

**Why:** Only 1 of 6 VICs (the one regenerated post-1376f01) uses `[segmentId]` citations. The other 5 use `[123ms-456ms]` ranges that lose YouTube-link precision.

**Files:**
- Create: `packages/pipeline/src/scripts/regen-vic-citations.ts`

- [ ] **Step 1: Identify the 5 VICs needing regeneration**

```bash
cd packages/pipeline
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { videoIntelligenceCard, segment } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const RUN = '037458ae-1439-4e56-a8da-aa967f2f5e1b';
  const db = getDb();
  const segs = await db.select({ id: segment.id }).from(segment).where(eq(segment.runId, RUN));
  const segIds = new Set(segs.map(s => s.id));
  const vics = await db.select({ videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, RUN));
  const uuidPat = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  for (const v of vics) {
    const valid = (JSON.stringify(v.payload).match(uuidPat) ?? []).filter(id => segIds.has(id));
    console.log(v.videoId, ':', valid.length, 'segmentId citations');
  }
  await closeDb();
})();
"
```

Capture the 5 video IDs whose count is 0.

- [ ] **Step 2: Write `regen-vic-citations.ts`**

Reuses `buildVicPrompt` logic from `seed-audit-via-codex.ts` (currently inline at lines 340-393). The cleanest approach is to inline the same prompt template.

```ts
/**
 * Operator one-off: regenerate 5 VICs whose original generation predates
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

import { and, asc, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import { channelProfile, segment, video, videoIntelligenceCard, visualMoment } from '@creatorcanon/db/schema';

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
    const settle = (cb: () => void) => { if (settled) return; settled = true; try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} cb(); };
    const proc = spawn(CODEX_BINARY, ['exec', '--skip-git-repo-check', '-o', tmpFile], { stdio: ['pipe', 'ignore', 'pipe'], env: process.env, shell: process.platform === 'win32' });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    if (proc.stdin) { proc.stdin.on('error', () => {}); proc.stdin.write(prompt); proc.stdin.end(); }
    const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} settle(() => reject(new Error('codex timed out'))); }, CODEX_TIMEOUT_MS);
    proc.on('error', (err) => { clearTimeout(timer); settle(() => reject(new Error(`codex spawn failed: ${err.message}`))); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`))); return; }
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
  if (!v[0]) { console.warn(`[vic-regen] ${videoId}: not found`); return; }

  const segs = await db.select({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs, text: segment.text }).from(segment).where(and(eq(segment.runId, runId), eq(segment.videoId, videoId))).orderBy(asc(segment.startMs));
  const moments = await db.select({ id: visualMoment.id, timestampMs: visualMoment.timestampMs, type: visualMoment.type, description: visualMoment.description, hubUse: visualMoment.hubUse }).from(visualMoment).where(and(eq(visualMoment.runId, runId), eq(visualMoment.videoId, videoId)));

  const segmentBlock = segs.map((s) => `[${s.id}] ${s.startMs}ms-${s.endMs}ms: ${s.text}`).join('\n');
  const visualBlock = moments.length > 0
    ? moments.map((m) => `[${m.id}] ${m.timestampMs}ms ${m.type}: ${m.description} (hubUse: ${m.hubUse})`).join('\n')
    : '(no visual moments)';

  const durationMin = Math.round(((v[0].durationSeconds ?? 0)) / 60);
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
  const newPayload = extractJsonFromCodexOutput(raw);
  if (!newPayload) throw new Error(`failed to extract JSON for ${videoId}`);

  await db.update(videoIntelligenceCard).set({ payload: newPayload as Record<string, unknown> }).where(and(eq(videoIntelligenceCard.runId, runId), eq(videoIntelligenceCard.videoId, videoId)));
  console.info(`[vic-regen] ${videoId}: payload replaced`);
}

async function main() {
  const runId = process.argv[2];
  const videoIds = process.argv.slice(3);
  if (!runId || videoIds.length === 0) throw new Error('Usage: tsx ./src/scripts/regen-vic-citations.ts <runId> <videoId> [<videoId>...]');

  const db = getDb();
  const cp = await db.select().from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (!cp[0]) throw new Error('No channel profile');

  for (const vid of videoIds) {
    try { await regenForVideo(runId, vid, cp[0].payload); }
    catch (err) { console.error(`[vic-regen] ${vid} FAILED: ${(err as Error).message}`); }
  }
  console.info(`[vic-regen] DONE`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[vic-regen] FAILED', e); process.exit(1); });
```

- [ ] **Step 3: Run the regen for the 5 video IDs from Step 1**

```bash
./node_modules/.bin/tsx ./src/scripts/regen-vic-citations.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b <vid1> <vid2> <vid3> <vid4> <vid5>
```

Expected: 5 lines `[vic-regen] <videoId>: payload replaced`. ~30-40 minutes total.

- [ ] **Step 4: Verify all 6 VICs now use segmentId citations**

Re-run the inspection query from Step 1. Expected: every video shows >= 20 segmentId citations.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/scripts/regen-vic-citations.ts
git commit -m "feat(audit-cleanup): regenerate VICs with segmentId-first citation prompt"
```

---

### Task 7: Final verification + audit URL handoff

- [ ] **Step 1: Run the full audit-state inspection**

```bash
cd packages/pipeline
./node_modules/.bin/tsx ./src/scripts/inspect-audit-state.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

- [ ] **Step 2: Run an integrity audit script**

```bash
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { canonNode, generationStageRun, pageBrief, segment, videoIntelligenceCard, visualMoment } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const RUN = '037458ae-1439-4e56-a8da-aa967f2f5e1b';
  const db = getDb();
  const briefs = await db.select({ payload: pageBrief.payload, position: pageBrief.position }).from(pageBrief).where(eq(pageBrief.runId, RUN)).orderBy(asc(pageBrief.position));
  const pillarSlugs = new Set(briefs.filter(b => (b.payload as any)?.editorialStrategy?.clusterRole?.tier === 'pillar').map(b => (b.payload as any).slug));
  let orphanSpokes = 0;
  const positions = briefs.map(b => b.position);
  const positionsAreSequential = positions.every((p, i) => p === i + 1);
  for (const b of briefs) {
    const cr = (b.payload as any)?.editorialStrategy?.clusterRole;
    if (cr?.tier === 'spoke' && cr.parentTopic && !pillarSlugs.has(cr.parentTopic)) orphanSpokes++;
  }
  const segs = await db.select({ id: segment.id }).from(segment).where(eq(segment.runId, RUN));
  const segIds = new Set(segs.map(s => s.id));
  const nodes = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, RUN));
  const uuidPat = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  let nodesWithCit = 0;
  for (const n of nodes) {
    const valid = (JSON.stringify(n.payload).match(uuidPat) ?? []).filter(id => segIds.has(id));
    if (valid.length > 0) nodesWithCit++;
  }
  const vics = await db.select({ videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, RUN));
  let vicsWithCit = 0;
  for (const v of vics) {
    const valid = (JSON.stringify(v.payload).match(uuidPat) ?? []).filter(id => segIds.has(id));
    if (valid.length > 0) vicsWithCit++;
  }
  const moments = await db.select().from(visualMoment).where(eq(visualMoment.runId, RUN));
  const stages = await db.select().from(generationStageRun).where(eq(generationStageRun.runId, RUN));
  const failedStages = stages.filter(s => s.status === 'failed_terminal').length;
  const seen = new Map<string, number>();
  for (const s of stages) {
    const k = s.stageName;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dupStages = [...seen.entries()].filter(([_, c]) => c > 1).length;

  console.log('=== PHASE 1.7 VERIFICATION ===');
  console.log('Briefs:', briefs.length, '| positions sequential 1..N:', positionsAreSequential);
  console.log('Pillars:', pillarSlugs.size, '| orphan spokes:', orphanSpokes);
  console.log('Canon nodes with citations:', nodesWithCit, '/', nodes.length);
  console.log('VICs with segmentId citations:', vicsWithCit, '/', vics.length);
  console.log('Visual moments:', moments.length);
  console.log('Stage runs:', stages.length, '| failed_terminal:', failedStages, '| duplicate stage names:', dupStages);
  await closeDb();
})();
"
```

Expected:
```
Briefs: 23 | positions sequential 1..N: true
Pillars: 7 | orphan spokes: 0
Canon nodes with citations: 30+ / 36
VICs with segmentId citations: 6 / 6
Visual moments: 17
Stage runs: ~17 | failed_terminal: 0 | duplicate stage names: 0
```

- [ ] **Step 3: Spot-check audit page rendering**

Open `https://<dev-or-prod-host>/runs/037458ae-1439-4e56-a8da-aa967f2f5e1b/audit` and verify:
- Cluster Topology section shows 3 named clusters each with 1 pillar + 6 spokes, plus a "Pillar pages" section with the 4 standalone pillars
- Visual Moments count is 17, no duplicates
- Stage Cost Breakdown lists each stage exactly once, no failed badges
- Canon nodes (Knowledge Graph section) show clickable timestamp links inline

- [ ] **Step 4: Final commit + push**

```bash
git push origin feat/hub-pipeline-workbench-v2
```

---

## Self-Review Checklist (run before execution)

- [ ] Spec coverage: all 8 audit gaps from "Audit-discovered gaps" map to one or more tasks
- [ ] Placeholder scan: no "TBD" / "fill in details" / "similar to" — every step has runnable content or concrete commands
- [ ] Type consistency: helper signatures match across tasks (runCodex, extractJsonFromCodexOutput)
- [ ] Idempotency: every script either skips already-correct rows or rewrites them deterministically
- [ ] Commit cadence: each task ends with a commit; no batch-commit-everything-at-end pattern

---

## Execution mode

Inline execution (single session). The 6 scripts are independent; if any Codex-driven task (4, 5, 6) produces poor output, the deterministic tasks (1, 2, 3, 7) still land cleanly and the audit moves up regardless.
