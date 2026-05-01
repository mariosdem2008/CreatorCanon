# Hormozi Audit → Agency-Ready (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the existing Hormozi run (`037458ae-1439-4e56-a8da-aa967f2f5e1b`) from its current ~45% audit-ready state to ~95% agency-ready by adding (a) clickable YouTube timestamp citations across the entire audit, (b) a richer canon graph (~25-30 nodes, up from 8), (c) consolidated reference artifacts (glossary, quote anthology, credibility numbers, mistakes catalog, tools index), (d) cross-video synthesis nodes + a reader journey, (e) a fuller page brief catalog (~15-18 briefs, up from 1), and (f) an editorial strategy layer (persona + SEO + CTA + cluster topology + journey phase + voice fingerprint per brief).

**Architecture:** All work happens through offline TypeScript scripts in `packages/pipeline/src/scripts/` plus targeted edits to the audit lib at `apps/web/src/lib/audit/`. No new pipeline stages are added to the production harness yet (those become Phase 2). Each task is idempotent and resume-safe — re-running is always a no-op or an additive merge. The Codex CLI provider is the LLM workhorse; OpenAI/Gemini are not touched (they're still quota-walled). The DB is the persistence layer; everything reads/writes through Drizzle as the existing offline scripts do.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL (Neon), Codex CLI v0.125.0 (subprocess), Next.js 14.2.13 (audit page UI), Cloudflare R2 (transcript storage), Whisper-via-Groq (already configured).

**Phase 1 stop gate:** After Task 12, the user opens the audit page, clicks **Copy audit**, and reviews the resulting markdown blob. Plan execution pauses here for review.

**Phase 2 (mentioned now so we don't forget):** Extract the rubrics encoded inline in this plan's Codex prompts into proper Claude Code skills under `.claude/skills/pipeline/` (framework-extraction, editorial-strategy, cross-video-synthesis, citation-chain, voice-fingerprint). Build a tiny `buildSystemPrompt(skill, mode)` harness so the skill content is the single source of truth for both dev-time work AND runtime stage prompts. Then: backfill visual moments via Groq's `llama-3.2-90b-vision-preview`, add a citation-chain validator stage, add a voice-fingerprint compliance check stage, and wire all of these into the production canon_v1 pipeline (currently they live as offline scripts).

---

## File Structure

**New files:**

- `packages/pipeline/src/scripts/link-uploads-to-youtube.ts` — backfill `youtube_video_id` for the 6 manual-upload Hormozi videos
- `packages/pipeline/src/scripts/seed-reference-artifacts.ts` — consolidate VIC content into 5 reference canon nodes (glossary, quotes, numbers, mistakes, tools); pure data work, no LLM calls
- `packages/pipeline/src/scripts/seed-editorial-strategy.ts` — for each page brief, generate persona + SEO + CTA + cluster + journey phase + voice fingerprint via Codex CLI; stored on `page_brief.payload.editorialStrategy`

**Modified files:**

- `packages/pipeline/src/scripts/seed-audit-via-codex.ts` — extend with: (a) `buildCanonPrompt` accepts a `mustCover` hint list auto-extracted from VICs; (b) raise `MAX_ITERATIONS` to 15, target 25 nodes; (c) `generatePageBriefs` becomes iteration-based with hint list (mirrors canon); (d) post-canon stage that generates 3-5 cross-video synthesis nodes; (e) post-canon stage that generates 1 Reader Journey Card; (f) "force regenerate" CLI flag (`--regen-canon`, `--regen-briefs`) that deletes existing rows for the run before re-running
- `apps/web/src/lib/audit/get-run-audit.ts` — load all segments for the run + the `youtubeVideoId` per video; include them in `RunAuditView`
- `apps/web/src/lib/audit/types.ts` — add `segmentMap` (segmentId → {videoId, startMs}) and `youtubeIdByVideoId` to `RunAuditView`
- `apps/web/src/lib/audit/build-audit-markdown.ts` — post-process the rendered markdown to replace `[<segmentId>]` patterns with clickable YouTube timestamp links; add "▶ Watch on YouTube" deep-link to each VIC section header; similarity-match orphan quotes to nearest segments

---

## Task 1: YouTube URL backfill

**Files:**
- Create: `packages/pipeline/src/scripts/link-uploads-to-youtube.ts`

- [ ] **Step 1: Create the script with the 6 hard-coded mappings**

Create `packages/pipeline/src/scripts/link-uploads-to-youtube.ts`:

```ts
/**
 * Operator one-off: populate `video.youtube_video_id` on the 6 manual-upload
 * Hormozi rows so downstream citation rendering can deep-link into YouTube
 * with timestamps. Idempotent — re-running is a no-op when the column is
 * already populated to the requested value.
 */
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { video } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const MAPPINGS: Array<{ videoId: string; youtubeId: string; titleHint: string }> = [
  { videoId: 'mu_19babea8dd50', youtubeId: 'fr78adfAnuA', titleHint: 'How to Use AI in Your Business in 2026' },
  { videoId: 'mu_d1874754ed57', youtubeId: '9q5ojtkqsBs', titleHint: 'How to Win With AI in 2026' },
  { videoId: 'mu_ef960bd0c8b8', youtubeId: 'yb2cLMMuMdQ', titleHint: 'How to make progress faster than everyone' },
  { videoId: 'mu_bedea1b0c85a', youtubeId: 'uWdIgftpvBI', titleHint: 'If I Started A Business in 2026' },
  { videoId: 'mu_680b5481c40b', youtubeId: 'jfW6gL6hKhk', titleHint: 'If I Wanted to Make My First $100K in 2026' },
  { videoId: 'mu_429e72237932', youtubeId: 'UDBkiBnMrHs', titleHint: 'If you’re ambitious but inconsistent' },
];

async function main() {
  const db = getDb();
  for (const m of MAPPINGS) {
    const rows = await db.select({ id: video.id, title: video.title, current: video.youtubeVideoId })
      .from(video).where(eq(video.id, m.videoId)).limit(1);
    const v = rows[0];
    if (!v) { console.warn(`[link-yt] ${m.videoId} not found in video table; skipping`); continue; }
    if (!v.title?.toLowerCase().includes(m.titleHint.toLowerCase().slice(0, 25))) {
      throw new Error(`[link-yt] safety check failed: ${m.videoId} title="${v.title}" doesn't match expected "${m.titleHint}"`);
    }
    if (v.current === m.youtubeId) { console.log(`[link-yt] ${m.videoId} already=${m.youtubeId} (no-op)`); continue; }
    await db.update(video).set({ youtubeVideoId: m.youtubeId }).where(eq(video.id, m.videoId));
    console.log(`[link-yt] ${m.videoId} → ${m.youtubeId} (${v.title})`);
  }
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
```

- [ ] **Step 2: Typecheck**

Run from `packages/pipeline`:
```bash
pnpm typecheck
```
Expected: clean exit (no errors).

- [ ] **Step 3: Run the backfill**

Run from `packages/pipeline`:
```bash
./node_modules/.bin/tsx ./src/scripts/link-uploads-to-youtube.ts
```
Expected output (exact):
```
[link-yt] mu_19babea8dd50 → fr78adfAnuA (How to Use AI in Your Business in 2026 - Alex Hormozi)
[link-yt] mu_d1874754ed57 → 9q5ojtkqsBs (How to Win With AI in 2026 - Alex Hormozi)
[link-yt] mu_ef960bd0c8b8 → yb2cLMMuMdQ (How to make progress faster than everyone - Alex Hormozi)
[link-yt] mu_bedea1b0c85a → uWdIgftpvBI (If I Started A Business in 2026, I'd Do This - Alex Hormozi)
[link-yt] mu_680b5481c40b → jfW6gL6hKhk (If I Wanted to Make My First $100K in 2026, I'd Do This - Alex Hormozi)
[link-yt] mu_429e72237932 → UDBkiBnMrHs (If you’re ambitious but inconsistent, please watch this - Alex Hormozi)
```

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/scripts/link-uploads-to-youtube.ts
git commit -m "feat(scripts): backfill youtube_video_id for the 6 Hormozi manual uploads

So downstream citation rendering can build deep-links of the form
youtube.com/watch?v=<id>&t=<startSec>s pointing at the exact second
where the cited transcript segment lives."
```

---

## Task 2: Auto-extract must-cover hints from existing VICs

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

The current canon iterator gives Codex only the channel profile + 6 raw VICs and asks for "25-50 nodes." Codex consistently returns 1 per call (its "best one"), and the de-dupe-by-title accumulator hits the wall at iteration 8 with OOM. To fix this, we feed each iteration a **must-cover list** auto-extracted from the VICs themselves: every named framework, every distinct lesson, every defined term that's framework-worthy. Codex no longer has to "decide what's important" — it just has to canonize what we've already named. This dramatically lifts node-per-iteration yield.

- [ ] **Step 1: Add a must-cover extractor near the other helpers**

In `packages/pipeline/src/scripts/seed-audit-via-codex.ts`, add this function near the other `Stage 3` helpers (e.g., right above `buildCanonPrompt`):

```ts
/**
 * Pull every named framework, lesson, and definition out of the 6 VICs to
 * use as a "must-cover" list when prompting Codex for canon nodes. The
 * list is the spine of the knowledge graph: anything Hormozi *named* in
 * the videos should become its own canon node.
 */
function extractMustCoverFromVics(
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): { frameworks: string[]; definitions: string[]; lessons: string[] } {
  const frameworks = new Set<string>();
  const definitions = new Set<string>();
  const lessons = new Set<string>();
  for (const v of vics) {
    for (const f of v.payload.frameworks ?? []) {
      const name = (f as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim().length > 0) frameworks.add(name.trim());
    }
    for (const t of v.payload.termsDefined ?? []) {
      const term = (t as { term?: unknown }).term;
      if (typeof term === 'string' && term.trim().length > 0) definitions.add(term.trim());
    }
    for (const l of v.payload.lessons ?? []) {
      if (typeof l === 'string' && l.trim().length > 20) lessons.add(l.trim().slice(0, 140));
    }
  }
  return {
    frameworks: [...frameworks],
    definitions: [...definitions],
    lessons: [...lessons].slice(0, 24), // cap so the prompt doesn't blow context
  };
}
```

- [ ] **Step 2: Update `buildCanonPrompt` to accept and inject a must-cover hint**

Change the signature and body of `buildCanonPrompt` in the same file:

```ts
function buildCanonPrompt(
  profile: ChannelProfilePayload,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
  alreadyHave: string[],
  remaining: number,
  mustCover: { frameworks: string[]; definitions: string[]; lessons: string[] },
): string {
  const vicBlock = vics.map((v) => `## ${v.title} (${v.videoId})\n${JSON.stringify(v.payload, null, 2)}`).join('\n\n');
  const alreadyBlock = alreadyHave.length > 0
    ? `\n\n# Already-generated nodes (DO NOT repeat — produce DIFFERENT nodes than these)\n${alreadyHave.map((t) => `- ${t}`).join('\n')}`
    : '';
  const remainingFrameworks = mustCover.frameworks.filter((f) => !alreadyHave.some((t) => t.toLowerCase().includes(f.toLowerCase())));
  const remainingDefinitions = mustCover.definitions.filter((d) => !alreadyHave.some((t) => t.toLowerCase().includes(d.toLowerCase())));
  const mustCoverBlock = (remainingFrameworks.length > 0 || remainingDefinitions.length > 0)
    ? [
        '',
        '# MUST-COVER LIST (priority order — these are named in the VICs and DESERVE their own canon node)',
        '## Named frameworks not yet canonized:',
        remainingFrameworks.map((f) => `- ${f}`).join('\n') || '(all covered)',
        '## Defined terms not yet canonized:',
        remainingDefinitions.slice(0, 12).map((d) => `- ${d}`).join('\n') || '(all covered)',
        '',
        'Pick from this list FIRST. Only generate "new discovery" nodes after the must-cover items are exhausted.',
      ].join('\n')
    : '';
  return [
    'You are canon_architect. Extract DISTINCT canon nodes from the run\'s intelligence cards.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Video Intelligence Cards (${vics.length} videos)`,
    vicBlock,
    alreadyBlock,
    mustCoverBlock,
    '',
    '# Instructions',
    `Produce up to ${remaining} more DISTINCT canon nodes. Each node must teach something specific — a framework, a lesson, a playbook, a principle, a definition, a pattern, a tactic. Prefer items from the MUST-COVER LIST. Cross-reference: if multiple videos teach the same idea, that's ONE multi_video node.`,
    '',
    'For EACH node, the payload MUST include these editorial fields (use null where the source genuinely doesn\'t address it):',
    '- title (string) — use the EXACT name from the must-cover list when it applies',
    '- summary (1-2 sentences)',
    '- whenToUse (1-2 sentences)',
    '- whenNotToUse (1-2 sentences OR null)',
    '- commonMistake (1 sentence OR null)',
    '- successSignal (1 sentence)',
    '- preconditions (string[]): for frameworks/playbooks/lessons',
    '- steps (string[]): for frameworks/playbooks',
    '- sequencingRationale (string OR null): for frameworks/playbooks',
    '- failureModes (string[])',
    '- examples (string[]) drawn from the VICs',
    '- definition (string): for definition-type nodes',
    '',
    '# OUTPUT FORMAT — CRITICAL',
    `Respond with a single JSON ARRAY containing AT LEAST ${Math.min(remaining, 8)} distinct canon node objects. First char must be \`[\`, last char must be \`]\`. NEVER return a single object — wrap as \`[{...}]\`. No preamble, no markdown fences.`,
    '',
    'Skeleton:',
    '[',
    '  { "type": "framework"|"lesson"|"playbook"|"principle"|"pattern"|"tactic"|"definition"|"aha_moment"|"quote"|"topic"|"example",',
    '    "payload": { "title": "...", "summary": "...", "whenToUse": "...", "whenNotToUse": null, "commonMistake": null, "successSignal": "...", "preconditions": [], "steps": [], "sequencingRationale": null, "failureModes": [], "examples": [] },',
    '    "sourceVideoIds": ["mu_..."],',
    '    "origin": "multi_video"|"single_video"|"channel_profile"|"derived",',
    '    "confidenceScore": 0-100, "pageWorthinessScore": 0-100, "specificityScore": 0-100, "creatorUniquenessScore": 0-100,',
    '    "evidenceQuality": "high"|"medium"|"low" },',
    '  { ... another distinct node ... }',
    ']',
    '',
    `Begin with \`[\` and produce ${Math.min(remaining, 8)}-${remaining} distinct entries (NOT duplicates of the already-generated list).`,
  ].join('\n');
}
```

- [ ] **Step 3: Update `generateCanonNodes` to compute and pass the must-cover list, and raise iteration ceiling**

Replace the current `generateCanonNodes` body with this expanded version (the constants and the call site change):

```ts
async function generateCanonNodes(
  profile: ChannelProfilePayload,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): Promise<CanonNodeOut[]> {
  const TARGET = 25;
  const MIN_ACCEPTABLE = 8;
  const MAX_ITERATIONS = 15;
  const accumulated: CanonNodeOut[] = [];
  const seenTitles = new Set<string>();
  const mustCover = extractMustCoverFromVics(vics);
  console.info(`[codex-audit] canon must-cover: ${mustCover.frameworks.length} frameworks, ${mustCover.definitions.length} definitions, ${mustCover.lessons.length} lessons in scope`);

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const remaining = TARGET - accumulated.length;
    if (remaining <= 0) break;
    const prompt = buildCanonPrompt(profile, vics, [...seenTitles], remaining, mustCover);
    console.info(`[codex-audit] canon iteration ${i + 1}/${MAX_ITERATIONS} (have ${accumulated.length}, asking for up to ${remaining} more)…`);
    let batch: CanonNodeOut[];
    try {
      batch = await codexJson<CanonNodeOut[]>(prompt, `canon_nodes_iter_${i + 1}`, 'array', CANON_TIMEOUT_MS);
    } catch (err) {
      console.warn(`[codex-audit] canon iteration ${i + 1} failed entirely: ${(err as Error).message}`);
      if (accumulated.length >= MIN_ACCEPTABLE) break;
      continue;
    }
    let added = 0;
    for (const node of batch) {
      const title = node.payload?.title?.toString().trim();
      if (!title) continue;
      if (seenTitles.has(title.toLowerCase())) continue;
      seenTitles.add(title.toLowerCase());
      accumulated.push(node);
      added += 1;
    }
    console.info(`[codex-audit] canon iteration ${i + 1}: +${added} new (total ${accumulated.length})`);
    if (added === 0) {
      console.warn(`[codex-audit] canon iteration ${i + 1} added 0 new nodes; stopping iteration`);
      break;
    }
  }

  if (accumulated.length < MIN_ACCEPTABLE) {
    throw new Error(`canon_nodes: only got ${accumulated.length} nodes after ${MAX_ITERATIONS} iterations (min acceptable: ${MIN_ACCEPTABLE})`);
  }
  console.info(`[codex-audit] canon synthesis complete: ${accumulated.length} distinct nodes`);
  return accumulated;
}
```

- [ ] **Step 4: Add a `--regen-canon` CLI flag to the script's `main()`**

In `main()`, near the top after `loadRun`:

```ts
const regenCanon = process.argv.includes('--regen-canon');
const regenBriefs = process.argv.includes('--regen-briefs');
```

In the canon resume block (the `if (existingCanon.length > 0)` branch), wrap with:

```ts
if (existingCanon.length > 0 && !regenCanon) {
  // ...existing resume logic...
} else {
  if (regenCanon && existingCanon.length > 0) {
    console.info(`[codex-audit] --regen-canon: deleting ${existingCanon.length} existing canon nodes for run ${runId}`);
    await db.delete(canonNode).where(eq(canonNode.runId, runId));
    // also clear page_brief because briefs reference deleted canon ids
    await db.delete(pageBrief).where(eq(pageBrief.runId, runId));
  }
  const canonNodesOut = await generateCanonNodes(profilePayload, vicResults);
  // ...existing write loop...
}
```

(Add the matching `pageBrief` import to the `import { ... } from '@creatorcanon/db/schema'` block at the top of the file. It's likely already there.)

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): canon iterator gets must-cover hint list + --regen-canon

Codex stops 'picking the best one' because every iteration sees a list of
named frameworks and defined terms that ALREADY appeared in the VICs. The
priority becomes 'canonize what we named' rather than 'discover what's
important.' Yield-per-iteration goes from ~1 to ~3-6.

Adds --regen-canon flag for re-running against an existing run; deletes
existing canon_node + page_brief rows before regenerating."
```

---

## Task 3: Run canon-v2 against the Hormozi run

**Files:** none modified

- [ ] **Step 1: Re-run with regen + must-cover**

From `packages/pipeline`:
```bash
./node_modules/.bin/tsx ./src/scripts/seed-audit-via-codex.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b --regen-canon
```
Expected behavior: channel_profile + 6 VICs resume from DB; canon and brief rows are deleted; canon iteration starts fresh, this time with a 17-item must-cover list driving each prompt. Each iteration should now add 2-6 nodes. Target ≥ 20 nodes.

Watch for the line:
```
[codex-audit] canon synthesis complete: NN distinct nodes
```
where NN ≥ 20.

- [ ] **Step 2: Verify canon node count and topical coverage**

```bash
./node_modules/.bin/tsx ./src/scripts/inspect-audit-state.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```
Expected: `canon_node rows: NN` where NN ≥ 20.

Then run a coverage spot-check:
```bash
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const rows = await db.select({ type: canonNode.type, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, '037458ae-1439-4e56-a8da-aa967f2f5e1b'));
  for (const r of rows) console.log(r.type, '·', (r.payload as any).title);
  await closeDb();
})();
"
```

The output should include named frameworks like "4-4-4 Split", "1-1-1 Rule", "Top 10% Learning Loop", "Maker vs Manager Time", "Workflow-Based Thinking", "Train AI Like A New Employee", "BYOA / BYOS Career Strategy", "Barbell Strategy For The AI Future", "Cringe Reframe", "Premium One-on-One Bootstrap", "Three Frames for a 10x Offer", "Anchor-and-Downsell", "Value Deconstruction", "Frustration Tolerance Loop", "Future Self Standard", and "Document The Comeback". If any major one is missing after this run, the iteration loop simply needs more iterations (raise `MAX_ITERATIONS` to 20 and retry).

---

## Task 4: Reference artifacts (glossary, quotes, numbers, mistakes, tools)

**Files:**
- Create: `packages/pipeline/src/scripts/seed-reference-artifacts.ts`

This stage is pure data consolidation — no LLM calls. Read the 6 VICs, dedupe + theme + filter, write 5 special canon nodes that downstream pages can cite as a single reference.

- [ ] **Step 1: Create the consolidator script**

Create `packages/pipeline/src/scripts/seed-reference-artifacts.ts`:

```ts
/**
 * Operator one-off: consolidate VIC content into 5 reference canon nodes
 * (glossary, quote anthology, credibility numbers, mistakes catalog, tools
 * index). Pure data work — no LLM calls. Idempotent: re-running deletes
 * any prior reference nodes for the run before re-creating.
 *
 * The reference nodes are stored as canon_node rows with type='topic' and
 * payload.kind='reference_*' so downstream display layers can recognise
 * them and render them differently from regular topic nodes.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-reference-artifacts.ts <runId>
 */

import crypto from 'node:crypto';
import { and, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import { canonNode, generationRun, videoIntelligenceCard } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface VicPayload {
  termsDefined?: Array<{ term?: string; definition?: string }>;
  quotes?: string[];
  examples?: string[];
  stories?: string[];
  strongClaims?: string[];
  mistakesToAvoid?: Array<{ mistake?: string; why?: string; correction?: string }>;
  toolsMentioned?: string[];
  [k: string]: unknown;
}

const NUMBER_PATTERN = /(\$[\d,]+(?:\.\d+)?[KMB]?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s*(?:percent|%|hours|years|locations|videos|ads|months|days|seconds|minutes|tickets|agreements|million|billion|thousand))/gi;

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-reference-artifacts.ts <runId>');

  const db = getDb();
  const run = (await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1))[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  // Idempotency: clear prior reference nodes for this run.
  const priorRefs = await db
    .select({ id: canonNode.id })
    .from(canonNode)
    .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));
  if (priorRefs.length > 0) {
    const refIds = priorRefs.map((r) => r.id);
    // Conservative — only delete rows whose payload.kind starts with 'reference_'
    const refRows = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(inArray(canonNode.id, refIds));
    const toDelete = refRows.filter((r) => typeof (r.payload as { kind?: string })?.kind === 'string' && (r.payload as { kind: string }).kind.startsWith('reference_')).map((r) => r.id);
    if (toDelete.length > 0) {
      await db.delete(canonNode).where(inArray(canonNode.id, toDelete));
      console.info(`[ref-artifacts] cleared ${toDelete.length} prior reference nodes`);
    }
  }

  const vicRows = await db
    .select({ videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload, evidenceSegmentIds: videoIntelligenceCard.evidenceSegmentIds })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));
  if (vicRows.length === 0) throw new Error('No VICs in run; can\'t consolidate references');

  const allEvidence = vicRows.flatMap((r) => r.evidenceSegmentIds ?? []);
  const allSourceVideoIds = vicRows.map((r) => r.videoId);

  // ── Glossary ────────────────────────────────────────────────────────
  const glossaryByTerm = new Map<string, string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const t of p.termsDefined ?? []) {
      const term = (t.term ?? '').trim();
      const def = (t.definition ?? '').trim();
      if (!term || !def) continue;
      // Keep the first non-trivial definition for each unique term.
      if (!glossaryByTerm.has(term.toLowerCase())) glossaryByTerm.set(term.toLowerCase(), `${term} — ${def}`);
    }
  }
  const glossaryEntries = [...glossaryByTerm.values()].sort();

  // ── Quote anthology ─────────────────────────────────────────────────
  const quoteSet = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const q of p.quotes ?? []) {
      const cleaned = q.replace(/^[\s"'""]+|[\s"'""]+$/g, '').trim();
      if (cleaned.length >= 10 && cleaned.length <= 280) quoteSet.add(cleaned);
    }
  }
  const allQuotes = [...quoteSet];

  // ── Credibility numbers (regex-extract numeric proof from examples + stories + claims) ─────
  const numberSet = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    const haystack = [...(p.examples ?? []), ...(p.stories ?? []), ...(p.strongClaims ?? [])].join('\n');
    const matches = haystack.match(NUMBER_PATTERN) ?? [];
    for (const m of matches) numberSet.add(m.trim());
  }
  // Also pull verbatim "by-the-numbers" sentences from strongClaims (claims with a number in them)
  const claimsWithNumbers = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const c of p.strongClaims ?? []) {
      if (NUMBER_PATTERN.test(c) && c.length >= 20 && c.length <= 280) claimsWithNumbers.add(c.trim());
      NUMBER_PATTERN.lastIndex = 0;
    }
  }

  // ── Mistakes catalog ────────────────────────────────────────────────
  const mistakes: Array<{ mistake: string; why: string; correction: string }> = [];
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const m of p.mistakesToAvoid ?? []) {
      const mistake = (m.mistake ?? '').trim();
      const why = (m.why ?? '').trim();
      const correction = (m.correction ?? '').trim();
      if (mistake && why && correction) mistakes.push({ mistake, why, correction });
    }
  }

  // ── Tools index ─────────────────────────────────────────────────────
  const toolSet = new Set<string>();
  for (const row of vicRows) {
    const p = row.payload as VicPayload;
    for (const t of p.toolsMentioned ?? []) {
      const cleaned = t.trim();
      if (cleaned.length > 0) toolSet.add(cleaned);
    }
  }
  const allTools = [...toolSet].sort();

  // ── Write 5 reference canon nodes ───────────────────────────────────
  type RefSpec = {
    kind: string;
    title: string;
    summary: string;
    payload: Record<string, unknown>;
    pageWorthinessScore: number;
  };
  const refs: RefSpec[] = [
    {
      kind: 'reference_glossary',
      title: 'Hormozi Glossary',
      summary: `${glossaryEntries.length} defined terms drawn from across the run, deduped and alphabetised.`,
      payload: { kind: 'reference_glossary', entries: glossaryEntries },
      pageWorthinessScore: 70,
    },
    {
      kind: 'reference_quotes',
      title: 'Hormozi Quote Anthology',
      summary: `${allQuotes.length} verbatim quotes pulled from the 6 videos in this run.`,
      payload: { kind: 'reference_quotes', quotes: allQuotes },
      pageWorthinessScore: 75,
    },
    {
      kind: 'reference_numbers',
      title: 'Hormozi by the Numbers',
      summary: `Credibility data block: ${numberSet.size} numeric proof points and ${claimsWithNumbers.size} numbered claims aggregated from the run for use as page anchors.`,
      payload: { kind: 'reference_numbers', numbers: [...numberSet], claims: [...claimsWithNumbers] },
      pageWorthinessScore: 80,
    },
    {
      kind: 'reference_mistakes',
      title: 'Hormozi Mistakes Catalog',
      summary: `${mistakes.length} mistake/why/correction triplets aggregated from across the videos.`,
      payload: { kind: 'reference_mistakes', mistakes },
      pageWorthinessScore: 78,
    },
    {
      kind: 'reference_tools',
      title: 'Hormozi Tools Index',
      summary: `${allTools.length} tools and products mentioned across the run.`,
      payload: { kind: 'reference_tools', tools: allTools },
      pageWorthinessScore: 60,
    },
  ];

  for (const ref of refs) {
    const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
    await db.insert(canonNode).values({
      id,
      workspaceId: run.workspaceId,
      runId,
      type: 'topic',
      payload: { ...ref.payload, title: ref.title, summary: ref.summary } as Record<string, unknown>,
      evidenceSegmentIds: allEvidence.slice(0, 50),
      sourceVideoIds: allSourceVideoIds,
      evidenceQuality: 'high',
      origin: 'derived',
      confidenceScore: 95,
      pageWorthinessScore: ref.pageWorthinessScore,
      specificityScore: 70,
      creatorUniquenessScore: 70,
      citationCount: Math.min(allEvidence.length, 50),
      sourceCoverage: allSourceVideoIds.length,
    });
    console.info(`[ref-artifacts] wrote ${ref.kind}: ${ref.title}`);
  }

  await closeDb();
}

main().catch(async (err) => { await closeDb(); console.error('[ref-artifacts] FAILED', err); process.exit(1); });
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: clean exit.

- [ ] **Step 3: Run the consolidator**

```bash
./node_modules/.bin/tsx ./src/scripts/seed-reference-artifacts.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```
Expected output:
```
[ref-artifacts] wrote reference_glossary: Hormozi Glossary
[ref-artifacts] wrote reference_quotes: Hormozi Quote Anthology
[ref-artifacts] wrote reference_numbers: Hormozi by the Numbers
[ref-artifacts] wrote reference_mistakes: Hormozi Mistakes Catalog
[ref-artifacts] wrote reference_tools: Hormozi Tools Index
```

- [ ] **Step 4: Verify**

```bash
./node_modules/.bin/tsx ./src/scripts/inspect-audit-state.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```
The `canon_node rows` count should now be **(prior canon count) + 5**.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/scripts/seed-reference-artifacts.ts
git commit -m "feat(audit-seed): consolidate VIC content into 5 reference canon nodes

Pure data work — no LLM calls. Reads the 6 VICs and aggregates:
- Glossary (deduped termsDefined)
- Quote anthology (deduped quotes, length-filtered)
- Hormozi by the Numbers (regex-extracted numeric proof + numbered claims)
- Mistakes catalog (mistake/why/correction triplets)
- Tools index (deduped toolsMentioned)

Stored as canon_node rows with type='topic' and payload.kind='reference_*'
so downstream display layers can recognise and render them as
hub-wide reference cards rather than regular topic pages."
```

---

## Task 5: Cross-video synthesis nodes

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

After the canon iteration, run one more Codex pass that asks: "Given all these canon nodes + the 6 VICs, what are the 3-5 cross-cutting unified theories Hormozi is teaching?" These become `topic`-type canon nodes with `payload.kind='synthesis'` — each one is a meta-claim about the creator's overall worldview.

- [ ] **Step 1: Add the synthesis generator function**

In `packages/pipeline/src/scripts/seed-audit-via-codex.ts`, add a new function near `generatePageBriefs`:

```ts
interface SynthesisNodeOut {
  title: string;
  summary: string;
  unifyingThread: string;
  childCanonNodeIds: string[];
  whyItMatters: string;
  pageWorthinessScore: number;
}

async function generateSynthesisNodes(
  profile: ChannelProfilePayload,
  canonNodesWithIds: Array<{ id: string; type: string; payload: Record<string, unknown> }>,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): Promise<SynthesisNodeOut[]> {
  const canonBlock = canonNodesWithIds
    .map((n) => `### [${n.id}] ${n.type} · ${(n.payload as { title?: string }).title ?? '(Untitled)'}\n${(n.payload as { summary?: string }).summary ?? ''}`)
    .join('\n\n');
  const vicTitles = vics.map((v) => `- ${v.videoId}: ${v.title}`).join('\n');

  const prompt = [
    'You are cross_video_synthesizer. Identify the 3-5 unifying theories or meta-narratives that thread through this creator\'s entire run.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Source videos (${vics.length})`,
    vicTitles,
    '',
    `# Canon nodes already extracted (${canonNodesWithIds.length})`,
    canonBlock,
    '',
    '# Instructions',
    'A "synthesis node" is a META-claim that connects 3+ existing canon nodes under a single unifying argument. Examples of the SHAPE we want (pretend this is for a different creator):',
    '- "Hormozi\'s Unified Theory of Leverage" — connects 1-1-1 Rule, AI Workflow Thinking, Premium 1-on-1, Barbell Strategy under "every game has an asymmetric input."',
    '- "The Founder\'s Survival-to-Scale Sequence" — connects First $100K Roadmap, Premium 1-on-1 Bootstrap, Workflow Thinking, AI as Leverage under a phased journey.',
    '',
    'Find 3-5 such cross-cutting theories. For each, identify which canon nodes it connects (by ID) and why it matters strategically.',
    '',
    '# OUTPUT FORMAT — CRITICAL',
    'Respond with a single JSON ARRAY of 3-5 synthesis objects. First char `[`, last char `]`. NEVER return a single object — wrap as `[{...}]`. No preamble, no markdown fences.',
    '',
    'Skeleton:',
    '[',
    '  { "title": "...",',
    '    "summary": "1-2 sentences naming the unifying argument",',
    '    "unifyingThread": "1 sentence — the single thread connecting the children",',
    '    "childCanonNodeIds": ["cn_..."],  // 3+ IDs from the canon list above',
    '    "whyItMatters": "1-2 sentences — why a hub reader benefits from seeing these together",',
    '    "pageWorthinessScore": 0-100 },',
    '  { ... another distinct synthesis ... }',
    ']',
  ].join('\n');

  console.info('[codex-audit] Generating cross-video synthesis nodes…');
  return codexJson<SynthesisNodeOut[]>(prompt, 'synthesis_nodes', 'array', DEFAULT_TIMEOUT_MS);
}
```

- [ ] **Step 2: Wire synthesis into `main()` after the canon stage**

In `main()`, immediately after the canon-resume / canon-write block (and before the page-briefs section), add:

```ts
// ── 3.5 Cross-video synthesis nodes ────────────────────────────────
const existingSynthesis = await db
  .select({ id: canonNode.id })
  .from(canonNode)
  .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));
const synthesisAlreadyExists = (await Promise.all(existingSynthesis.map(async (r) => {
  const row = await db.select({ payload: canonNode.payload }).from(canonNode).where(eq(canonNode.id, r.id)).limit(1);
  return (row[0]?.payload as { kind?: string })?.kind === 'synthesis';
}))).some(Boolean);

if (!synthesisAlreadyExists) {
  try {
    const synthOut = await generateSynthesisNodes(profilePayload, persistedCanonNodes, vicResults);
    const validIds = new Set(persistedCanonNodes.map((n) => n.id));
    for (const s of synthOut) {
      const children = (s.childCanonNodeIds ?? []).filter((id) => validIds.has(id));
      if (children.length < 2) {
        console.warn(`[codex-audit] synthesis "${s.title}" dropped: only ${children.length} valid child IDs`);
        continue;
      }
      const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
      await db.insert(canonNode).values({
        id,
        workspaceId: run.workspaceId,
        runId,
        type: 'topic',
        payload: { kind: 'synthesis', title: s.title, summary: s.summary, unifyingThread: s.unifyingThread, childCanonNodeIds: children, whyItMatters: s.whyItMatters } as Record<string, unknown>,
        evidenceSegmentIds: [],
        sourceVideoIds: vicResults.map((v) => v.videoId),
        evidenceQuality: 'high',
        origin: 'derived',
        confidenceScore: 90,
        pageWorthinessScore: clampScore(s.pageWorthinessScore),
        specificityScore: 80,
        creatorUniquenessScore: 90,
        citationCount: 0,
        sourceCoverage: vicResults.length,
      }).onConflictDoNothing();
      persistedCanonNodes.push({ id, type: 'topic', payload: { kind: 'synthesis', title: s.title, summary: s.summary } as Record<string, unknown>, pageWorthinessScore: clampScore(s.pageWorthinessScore) });
    }
    console.info(`[codex-audit] wrote ${synthOut.length} cross-video synthesis nodes`);
  } catch (err) {
    console.warn(`[codex-audit] synthesis stage failed (continuing): ${(err as Error).message}`);
  }
} else {
  console.info(`[codex-audit] synthesis nodes already present; skipping`);
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit (combine with Task 6 below in a single commit)** — leave this step uncommitted for now; the next task's commit will cover this and the Reader Journey together.

---

## Task 6: Reader Journey Card

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

A single playbook-type canon node that orders the major content into 5 reader phases (Survival → Cashflow → Scale → Leverage → Investing). Becomes the spine of the hub homepage.

- [ ] **Step 1: Add the journey generator function**

Below `generateSynthesisNodes`, add:

```ts
interface ReaderJourneyOut {
  title: string;
  summary: string;
  phases: Array<{
    phaseNumber: number;
    name: string;
    readerState: string;
    primaryCanonNodeIds: string[];
    nextStepWhen: string;
  }>;
}

async function generateReaderJourney(
  profile: ChannelProfilePayload,
  canonNodesWithIds: Array<{ id: string; type: string; payload: Record<string, unknown> }>,
): Promise<ReaderJourneyOut> {
  const canonBlock = canonNodesWithIds
    .map((n) => `### [${n.id}] ${n.type} · ${(n.payload as { title?: string }).title ?? '(Untitled)'}\n${(n.payload as { summary?: string }).summary ?? ''}`)
    .join('\n\n');

  const prompt = [
    'You are reader_journey_designer. Order this creator\'s canon content into a multi-phase journey a reader walks through over time.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Canon nodes (${canonNodesWithIds.length})`,
    canonBlock,
    '',
    '# Instructions',
    'Identify 4-6 sequential phases a reader of this creator\'s hub passes through. Each phase has a reader state (where the reader IS), the canon nodes that serve that phase, and a "next-step when" that signals readiness to graduate to the next phase.',
    '',
    'For Hormozi-style operator content, phases typically look like:',
    '1. Survival → first $100K roadmap',
    '2. Cashflow → premium 1-on-1, focus, pricing',
    '3. Scale → workflow thinking, hiring, offers',
    '4. Leverage → AI as leverage, BYOA',
    '5. Investing → barbell strategy, durable bets',
    '',
    'Adapt these to the actual canon nodes available. Skip phases that have no nodes.',
    '',
    '# OUTPUT FORMAT',
    'Respond with EXACTLY ONE JSON object — first char `{`, last char `}`. No preamble, no markdown fences.',
    '',
    'Skeleton:',
    '{',
    '  "title": "The Hormozi Reader Journey",',
    '  "summary": "1-2 sentences describing what the reader gets out of following this sequence",',
    '  "phases": [',
    '    { "phaseNumber": 1, "name": "...", "readerState": "1 sentence — what\'s true about the reader RIGHT NOW", "primaryCanonNodeIds": ["cn_..."], "nextStepWhen": "1 sentence — what signals readiness for phase 2" },',
    '    { "phaseNumber": 2, ... }',
    '  ]',
    '}',
  ].join('\n');

  console.info('[codex-audit] Generating Reader Journey Card…');
  return codexJson<ReaderJourneyOut>(prompt, 'reader_journey', 'object', DEFAULT_TIMEOUT_MS);
}
```

- [ ] **Step 2: Wire journey into `main()` after the synthesis block**

After the synthesis block in `main()`, add:

```ts
// ── 3.6 Reader Journey Card ────────────────────────────────────────
const existingJourney = await db
  .select({ payload: canonNode.payload })
  .from(canonNode)
  .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'playbook')))
  .limit(50);
const journeyAlreadyExists = existingJourney.some((r) => (r.payload as { kind?: string })?.kind === 'reader_journey');

if (!journeyAlreadyExists) {
  try {
    const journey = await generateReaderJourney(profilePayload, persistedCanonNodes);
    const validIds = new Set(persistedCanonNodes.map((n) => n.id));
    const cleanedPhases = (journey.phases ?? []).map((p) => ({
      ...p,
      primaryCanonNodeIds: (p.primaryCanonNodeIds ?? []).filter((id) => validIds.has(id)),
    })).filter((p) => p.primaryCanonNodeIds.length > 0);
    if (cleanedPhases.length === 0) {
      console.warn(`[codex-audit] reader journey dropped: no phases reference valid canon node IDs`);
    } else {
      const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
      await db.insert(canonNode).values({
        id,
        workspaceId: run.workspaceId,
        runId,
        type: 'playbook',
        payload: { kind: 'reader_journey', title: journey.title, summary: journey.summary, phases: cleanedPhases } as Record<string, unknown>,
        evidenceSegmentIds: [],
        sourceVideoIds: vicResults.map((v) => v.videoId),
        evidenceQuality: 'high',
        origin: 'derived',
        confidenceScore: 95,
        pageWorthinessScore: 95,
        specificityScore: 85,
        creatorUniquenessScore: 90,
        citationCount: 0,
        sourceCoverage: vicResults.length,
      });
      console.info(`[codex-audit] wrote Reader Journey Card with ${cleanedPhases.length} phases`);
    }
  } catch (err) {
    console.warn(`[codex-audit] reader journey stage failed (continuing): ${(err as Error).message}`);
  }
} else {
  console.info(`[codex-audit] reader journey already present; skipping`);
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Run the synthesis + journey for the Hormozi run**

The synthesis and journey blocks are gated by `existingSynthesis`/`existingJourney` checks, so re-running the script is safe. Run it now (no flags needed — canon won't regen):

```bash
./node_modules/.bin/tsx ./src/scripts/seed-audit-via-codex.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected lines in output:
```
[codex-audit] wrote N cross-video synthesis nodes  (where N is 3-5)
[codex-audit] wrote Reader Journey Card with M phases  (where M is 4-6)
```

- [ ] **Step 5: Commit Task 5 + Task 6 together**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): cross-video synthesis nodes + Reader Journey Card

Two new offline stages run after canon synthesis:

1) Synthesis nodes — 3-5 meta-claims that connect existing canon nodes
   under unified theories (e.g. 'Hormozi's Unified Theory of Leverage'
   threads 1-1-1, AI Workflow, Premium 1-on-1, Barbell). Stored as
   topic-type canon_node with payload.kind='synthesis'.

2) Reader Journey Card — single playbook-type canon node that orders
   major canon nodes into 4-6 reader phases (Survival → Cashflow →
   Scale → Leverage → Investing). Becomes the spine of the hub
   homepage."
```

---

## Task 7: Page brief iteration v2 with hint list

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

Same pattern as canon-v2: feed Codex a list of brief titles to cover (one per major canon node + clusters), iterate to accumulate, dedupe by title.

- [ ] **Step 1: Replace `generatePageBriefs` with an iteration-based version**

Replace the body of `generatePageBriefs` with:

```ts
function buildBriefPrompt(
  profile: ChannelProfilePayload,
  pageworthy: Array<{ id: string; type: string; payload: Record<string, unknown>; pageWorthinessScore: number }>,
  alreadyHave: string[],
  remaining: number,
  mustCover: string[],
): string {
  const block = pageworthy
    .map((n) => `### [${n.id}] ${n.type} · pageWorthiness=${n.pageWorthinessScore}\n${JSON.stringify(n.payload, null, 2)}`)
    .join('\n\n');
  const alreadyBlock = alreadyHave.length > 0
    ? `\n\n# Already-generated briefs (DO NOT repeat — produce DIFFERENT ones)\n${alreadyHave.map((t) => `- ${t}`).join('\n')}`
    : '';
  const remainingHints = mustCover.filter((t) => !alreadyHave.some((h) => h.toLowerCase().includes(t.toLowerCase().slice(0, 18))));
  const hintBlock = remainingHints.length > 0
    ? `\n\n# MUST-COVER PAGE TITLES (priority order)\n${remainingHints.slice(0, 24).map((t) => `- ${t}`).join('\n')}`
    : '';

  return [
    'You are page_brief_planner. Design hub pages by selecting and grouping canon nodes into briefs.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Page-worthy canon nodes (${pageworthy.length} total)`,
    block,
    alreadyBlock,
    hintBlock,
    '',
    '# Instructions',
    `Produce up to ${remaining} more DISTINCT page briefs. Pick from the must-cover hints FIRST; only invent new pages once those are exhausted. Every primary node must come from the canon list above.`,
    '',
    '# OUTPUT FORMAT — CRITICAL',
    `Respond with a single JSON ARRAY of AT LEAST ${Math.min(remaining, 6)} brief objects. First char \`[\`, last char \`]\`. NEVER a single object — wrap as \`[{...}]\`. No preamble, no markdown fences.`,
    '',
    'Skeleton:',
    '[',
    '  { "pageTitle": "...",',
    '    "pageType": "topic"|"framework"|"lesson"|"playbook"|"example_collection"|"definition"|"principle",',
    '    "audienceQuestion": "1 sentence — the reader\'s actual question",',
    '    "openingHook": "1 sentence — sticky opening line",',
    '    "slug": "kebab-case-slug",',
    '    "outline": [{ "sectionTitle": "...", "canonNodeIds": ["cn_..."], "intent": "..." }],',
    '    "primaryCanonNodeIds": ["cn_..."],',
    '    "supportingCanonNodeIds": ["cn_..."],',
    '    "pageWorthinessScore": 0-100,',
    '    "position": 0 },',
    '  { ... }',
    ']',
  ].join('\n');
}

async function generatePageBriefs(
  profile: ChannelProfilePayload,
  canonNodesWithIds: Array<{ id: string; type: string; payload: Record<string, unknown>; pageWorthinessScore: number }>,
): Promise<PageBriefOut[]> {
  const TARGET = 18;
  const MIN_ACCEPTABLE = 8;
  const MAX_ITERATIONS = 12;
  const pageworthy = canonNodesWithIds.filter((n) => n.pageWorthinessScore >= 60);
  // Auto-derive must-cover page titles from canon node titles (one-page-per-major-framework heuristic).
  const mustCover = pageworthy
    .filter((n) => ['framework', 'playbook', 'lesson', 'principle', 'tactic', 'topic'].includes(n.type))
    .map((n) => (n.payload as { title?: string }).title ?? '')
    .filter((t) => t.length > 0)
    .slice(0, 28);

  const accumulated: PageBriefOut[] = [];
  const seenTitles = new Set<string>();

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const remaining = TARGET - accumulated.length;
    if (remaining <= 0) break;
    const prompt = buildBriefPrompt(profile, pageworthy, [...seenTitles], remaining, mustCover);
    console.info(`[codex-audit] briefs iteration ${i + 1}/${MAX_ITERATIONS} (have ${accumulated.length}, asking for up to ${remaining} more)…`);
    let batch: PageBriefOut[];
    try {
      batch = await codexJson<PageBriefOut[]>(prompt, `page_briefs_iter_${i + 1}`, 'array', DEFAULT_TIMEOUT_MS);
    } catch (err) {
      console.warn(`[codex-audit] briefs iteration ${i + 1} failed: ${(err as Error).message}`);
      if (accumulated.length >= MIN_ACCEPTABLE) break;
      continue;
    }
    let added = 0;
    for (const b of batch) {
      const title = b.pageTitle?.trim();
      if (!title) continue;
      if (seenTitles.has(title.toLowerCase())) continue;
      seenTitles.add(title.toLowerCase());
      accumulated.push(b);
      added += 1;
    }
    console.info(`[codex-audit] briefs iteration ${i + 1}: +${added} new (total ${accumulated.length})`);
    if (added === 0) break;
  }

  if (accumulated.length < MIN_ACCEPTABLE) {
    throw new Error(`page_briefs: only got ${accumulated.length} after ${MAX_ITERATIONS} iterations (min ${MIN_ACCEPTABLE})`);
  }
  console.info(`[codex-audit] page brief synthesis complete: ${accumulated.length} briefs`);
  return accumulated;
}
```

- [ ] **Step 2: Update the briefs resume block in `main()` to honour `--regen-briefs`**

Find the existing briefs section in `main()`:

```ts
// ── 4. Page briefs ──────────────────────────────────────────────────
const existingBriefs = await db
  .select({ id: pageBrief.id })
  .from(pageBrief)
  .where(eq(pageBrief.runId, runId))
  .limit(1);
if (existingBriefs.length > 0) {
  console.info(`[codex-audit] page_brief rows already exist; skipping generation`);
} else {
  // ...generation...
}
```

Replace with:

```ts
// ── 4. Page briefs ──────────────────────────────────────────────────
const existingBriefsRows = await db.select({ id: pageBrief.id }).from(pageBrief).where(eq(pageBrief.runId, runId));
if (existingBriefsRows.length > 0 && !regenBriefs) {
  console.info(`[codex-audit] ${existingBriefsRows.length} page_brief rows already exist; skipping generation (use --regen-briefs to redo)`);
} else {
  if (regenBriefs && existingBriefsRows.length > 0) {
    console.info(`[codex-audit] --regen-briefs: deleting ${existingBriefsRows.length} existing page_brief rows`);
    await db.delete(pageBrief).where(eq(pageBrief.runId, runId));
  }
  const briefsOut = await generatePageBriefs(profilePayload, persistedCanonNodes);
  console.info(`[codex-audit] Codex returned ${briefsOut.length} page briefs`);
  const validIds = new Set(persistedCanonNodes.map((n) => n.id));
  for (let i = 0; i < briefsOut.length; i += 1) {
    const b = briefsOut[i]!;
    const primary = b.primaryCanonNodeIds.filter((id) => validIds.has(id));
    const supporting = (b.supportingCanonNodeIds ?? []).filter((id) => validIds.has(id));
    if (primary.length === 0) {
      console.warn(`[codex-audit] brief ${i} dropped: no valid primary canon node IDs`);
      continue;
    }
    const payload = { ...b, primaryCanonNodeIds: primary, supportingCanonNodeIds: supporting };
    await db.insert(pageBrief).values({
      id: `pb_${crypto.randomUUID().slice(0, 12)}`,
      workspaceId: run.workspaceId,
      runId,
      payload: payload as unknown as Record<string, unknown>,
      pageWorthinessScore: clampScore(b.pageWorthinessScore),
      position: typeof b.position === 'number' ? b.position : i,
    }).onConflictDoNothing();
  }
  console.info(`[codex-audit] page_brief rows written`);
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Run with --regen-briefs**

```bash
./node_modules/.bin/tsx ./src/scripts/seed-audit-via-codex.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b --regen-briefs
```

Expected: the script resumes channel/VICs/canon/synthesis/journey from DB, deletes the 1 existing brief, and re-runs the brief iterator. Final line should report `page_brief rows written` with at least 8 briefs.

Verify:
```bash
./node_modules/.bin/tsx ./src/scripts/inspect-audit-state.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```
`page_brief rows: NN` where NN ≥ 8 (target is 12-18).

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): page brief iteration v2 with auto must-cover hints

Mirrors the canon-v2 pattern: must-cover list is auto-derived from
canon node titles (one page per framework/playbook/lesson/principle).
Each iteration tells Codex which titles haven't been used yet so it
stops returning 'the best brief' and starts producing the catalog.

Adds --regen-briefs flag for re-running against an existing run."
```

---

## Task 8: Editorial strategy stage (persona + SEO + CTA + cluster + journey + voice)

**Files:**
- Create: `packages/pipeline/src/scripts/seed-editorial-strategy.ts`

For each page brief, generate a structured editorial strategy block: persona, SEO target, CTA, cluster role, journey phase, voice fingerprint. Stored on `page_brief.payload.editorialStrategy`.

- [ ] **Step 1: Create the script**

Create `packages/pipeline/src/scripts/seed-editorial-strategy.ts`:

```ts
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
    proc.on('close', (code) => { clearTimeout(timer); if (code !== 0) { settle(() => reject(new Error(`codex exit ${code}; stderr: ${stderr.slice(-400)}`))); return; } try { settle(() => resolve(fs.readFileSync(tmpFile, 'utf8'))); } catch (e) { settle(() => reject(new Error(`output not readable: ${(e as Error).message}`))); } });
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
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run the editorial strategy stage**

```bash
./node_modules/.bin/tsx ./src/scripts/seed-editorial-strategy.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected: one Codex call per page brief (~30-60s each), so 8-18 calls × ~45s ≈ 6-13 minutes total.

- [ ] **Step 4: Spot-check the result**

```bash
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const rows = await db.select({ id: pageBrief.id, payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, '037458ae-1439-4e56-a8da-aa967f2f5e1b'));
  for (const r of rows) {
    const p = r.payload as { pageTitle?: string; editorialStrategy?: { persona?: { name?: string }; journeyPhase?: number; clusterRole?: { tier?: string } } };
    console.log(p.pageTitle, '·', 'persona:', p.editorialStrategy?.persona?.name, '· phase:', p.editorialStrategy?.journeyPhase, '· tier:', p.editorialStrategy?.clusterRole?.tier);
  }
  await closeDb();
})();
"
```
Expected: every brief has a persona name, journey phase 1-5, and tier pillar/spoke.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/scripts/seed-editorial-strategy.ts
git commit -m "feat(audit-seed): editorial strategy stage adds persona/SEO/CTA/cluster/journey/voice per brief

Each page_brief.payload now carries an editorialStrategy block with
persona archetype, primary SEO keyword + intent + title/meta templates,
primary/secondary CTAs, cluster role (pillar vs spoke + parent topic +
sibling slugs), journey phase 1-5 (Survival → Cashflow → Scale →
Leverage → Investing), and a voice fingerprint (profanity allowed,
tone preset, terms to preserve verbatim). Generated via Codex CLI."
```

---

## Task 9: Audit lib loads YouTube IDs + segment timestamps

**Files:**
- Modify: `apps/web/src/lib/audit/types.ts`
- Modify: `apps/web/src/lib/audit/get-run-audit.ts`

The audit page needs to know each segment's `(videoId, startMs)` and each video's `youtubeVideoId` to render clickable timestamp links. Add both to `RunAuditView`.

- [ ] **Step 1: Extend `RunAuditView` type**

In `apps/web/src/lib/audit/types.ts`, add the two new map fields to `RunAuditView`:

```ts
export interface RunAuditView {
  // ...existing fields...
  /** segmentId → { videoId, startMs } — used by the markdown export to render clickable YouTube timestamps. */
  segmentMap: Record<string, { videoId: string; startMs: number }>;
  /** videoId → YouTube video ID (the `v=` parameter) — null when no YouTube linkage exists. */
  youtubeIdByVideoId: Record<string, string | null>;
}
```

- [ ] **Step 2: Extend the loader**

In `apps/web/src/lib/audit/get-run-audit.ts`, after the existing `videoTitleById` loading (and before the `return` block), add:

```ts
// Load all segments for this run, indexed by id → { videoId, startMs }.
const segmentRows = await db
  .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs })
  .from(segment)
  .where(eq(segment.runId, runId));
const segmentMap: Record<string, { videoId: string; startMs: number }> = {};
for (const s of segmentRows) segmentMap[s.id] = { videoId: s.videoId, startMs: s.startMs };

// Load YouTube IDs for the run's videos.
const ytRows = run.videoSetId
  ? await db
      .select({ id: video.id, youtubeId: video.youtubeVideoId })
      .from(video)
      .innerJoin(videoSetItem, eq(videoSetItem.videoId, video.id))
      .where(eq(videoSetItem.videoSetId, run.videoSetId))
  : [];
const youtubeIdByVideoId: Record<string, string | null> = {};
for (const v of ytRows) youtubeIdByVideoId[v.id] = v.youtubeId ?? null;
```

Add `segment` to the schema import at the top of the file (it's likely not imported yet). The import block should now include:
```ts
import {
  canonNode,
  channelProfile,
  generationRun,
  generationStageRun,
  pageBrief,
  project,
  segment,
  video,
  videoIntelligenceCard,
  videoSetItem,
  visualMoment,
} from '@creatorcanon/db/schema';
```

In the `return { ... }` object at the bottom of `getRunAudit`, add the two new fields:
```ts
return {
  // ...existing return fields...
  segmentMap,
  youtubeIdByVideoId,
};
```

- [ ] **Step 3: Typecheck**

From `apps/web`:
```bash
pnpm typecheck
```

- [ ] **Step 4: Commit (combine with Task 10's edits in a single commit)** — leave uncommitted; the next task's commit covers both.

---

## Task 10: Markdown export — clickable YouTube timestamp citations

**Files:**
- Modify: `apps/web/src/lib/audit/build-audit-markdown.ts`

Walk the rendered markdown and rewrite every `[<segmentId>]` token into a clickable timestamp link of the form `[3:42](https://youtube.com/watch?v=ABC&t=222s)`. Add a "▶ Watch on YouTube" deep link to each VIC section header. For quotes that lack inline segment IDs, similarity-match against the run's segments and inject the link.

- [ ] **Step 1: Update `RawAuditPayload` to accept the new maps**

In `apps/web/src/lib/audit/build-audit-markdown.ts`, locate the `RawAuditPayload` interface and add:

```ts
export interface RawAuditPayload {
  // ...existing fields...
  segmentMap: Record<string, { videoId: string; startMs: number }>;
  youtubeIdByVideoId: Record<string, string | null>;
  /** Optional: map videoId → an array of (segmentId, text) for similarity matching. */
  segmentTextsByVideoId?: Record<string, Array<{ segmentId: string; text: string }>>;
}
```

(Skip `segmentTextsByVideoId` for now — it'll be wired in a Phase 2 polish if we need orphan-quote rescue.)

- [ ] **Step 2: Add a `linkifyCitations` post-processor near the bottom of the file**

```ts
function formatYoutubeTs(startMs: number): string {
  const totalSec = Math.max(0, Math.floor(startMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function youtubeWatchUrl(youtubeId: string, startMs: number): string {
  const t = Math.max(0, Math.floor(startMs / 1000));
  return `https://www.youtube.com/watch?v=${youtubeId}&t=${t}s`;
}

/**
 * Replace inline `[seg_id]` tokens (UUIDs or hex IDs) with clickable
 * timestamp links. The agents' VIC outputs sometimes embed segmentIds in
 * brackets — we recognise UUID-shaped strings and look them up. Tokens
 * that don't resolve are left as-is so the audit still parses.
 */
function linkifyCitations(
  markdown: string,
  segmentMap: Record<string, { videoId: string; startMs: number }>,
  youtubeIdByVideoId: Record<string, string | null>,
): string {
  // Match [<id>] where <id> is a UUID-like or 12+ char alphanumeric.
  const pattern = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{12,})\]/gi;
  return markdown.replace(pattern, (whole, id: string) => {
    const seg = segmentMap[id];
    if (!seg) return whole;
    const yt = youtubeIdByVideoId[seg.videoId];
    if (!yt) return `[${formatYoutubeTs(seg.startMs)}]`;
    return `[${formatYoutubeTs(seg.startMs)}](${youtubeWatchUrl(yt, seg.startMs)})`;
  });
}
```

- [ ] **Step 3: Add a "▶ Watch on YouTube" header next to each VIC section title**

Find the per-VIC section in `buildAuditMarkdown`:

```ts
for (const v of p.videoIntelligenceCards) {
  const title = p.videoMap.get(v.videoId) ?? '(Untitled)';
  lines.push(`### Video: ${title}`);
  // ...
}
```

Replace the `lines.push(`### Video: ...`)` line with:

```ts
const youtubeId = p.youtubeIdByVideoId[v.videoId] ?? null;
const headerSuffix = youtubeId ? ` · [▶ Watch on YouTube](https://www.youtube.com/watch?v=${youtubeId})` : '';
lines.push(`### Video: ${title}${headerSuffix}`);
```

(The function reads `p.videoMap` etc. — adjust according to the field names actually used in your `RawAuditPayload`. If `videoMap` is `Record<string, string>` in your code, use `p.videoMap[v.videoId]` instead of `.get(...)`.)

- [ ] **Step 4: Apply `linkifyCitations` at the end of `buildAuditMarkdown`**

At the very bottom of `buildAuditMarkdown`, change:

```ts
return lines.join('\n');
```

to:

```ts
const raw = lines.join('\n');
return linkifyCitations(raw, p.segmentMap, p.youtubeIdByVideoId);
```

- [ ] **Step 5: Wire the new fields through the server action**

In `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/actions.ts`, the `getAuditMarkdown` function calls `getRunAudit` and then calls `buildAuditMarkdown`. The audit view now has the maps; verify they get passed through. Most likely no change is needed if `getAuditMarkdown` just passes `audit` straight through, but if it constructs a `RawAuditPayload`, add the two new fields there.

Find the call site (in the same actions file) and ensure it passes `segmentMap` and `youtubeIdByVideoId` from `audit` into `buildAuditMarkdown`.

- [ ] **Step 6: Typecheck**

From `apps/web`:
```bash
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/audit/types.ts apps/web/src/lib/audit/get-run-audit.ts apps/web/src/lib/audit/build-audit-markdown.ts apps/web/src/app/app/projects/\[id\]/runs/\[runId\]/audit/actions.ts
git commit -m "feat(audit-export): clickable YouTube timestamp citations

The audit lib now loads each segment's (videoId, startMs) and the run's
videoId → youtubeVideoId mapping. The markdown export post-processes
every [<segmentId>] reference into [m:ss](youtube.com/watch?v=...&t=...s).
Each VIC section header gets a '▶ Watch on YouTube' deep link.

Backed by the youtube_video_id column populated by
link-uploads-to-youtube.ts in Task 1."
```

---

## Task 11: Final verification

**Files:** none modified

- [ ] **Step 1: Restart the dev server (if it's not running)**

If the previous Next.js dev server died, restart it from `apps/web`:

```bash
pnpm dev
```

Wait for the line `✓ Ready in N s`.

- [ ] **Step 2: Open the audit page**

Navigate to:
```
http://localhost:3000/app/projects/ca713f3c-86d3-4430-8003-122d70cb4041/runs/037458ae-1439-4e56-a8da-aa967f2f5e1b/audit
```

Confirm:
- Channel profile renders with all 12 fields
- 6 VICs each have a `▶ Watch on YouTube` link in the section header
- Knowledge Graph section has ≥ 25 canon nodes (including 5 reference nodes prefixed "Hormozi Glossary", "Hormozi Quote Anthology", etc., and 1 "Reader Journey Card", and 3-5 synthesis nodes)
- Proposed Hub Pages section has ≥ 8 page briefs
- Stage cost breakdown is empty (offline scripts don't write generation_stage_run rows; that's expected)

- [ ] **Step 3: Click "Copy audit" and inspect the markdown**

Paste the clipboard contents into a text file (`/tmp/hormozi-final-audit.md`) and verify:
- Every `[<UUID>]` style citation has been replaced with a clickable `[m:ss](https://youtube.com/watch?v=...&t=...s)` link
- Each VIC section header has a `▶ Watch on YouTube` link
- The Reader Journey Card appears as a canon node
- The 5 reference artifacts (Glossary, Quotes, Numbers, Mistakes, Tools) appear as canon nodes
- Page briefs include `editorialStrategy` blocks (persona, SEO, CTA, cluster, journeyPhase, voiceFingerprint)

If anything's missing, the corresponding upstream task script can be re-run with the appropriate flag (`--regen-canon`, `--regen-briefs`) without losing the work that did succeed.

- [ ] **Step 4: Run the post-Phase-1 inspect snapshot**

```bash
cd packages/pipeline
./node_modules/.bin/tsx ./src/scripts/inspect-audit-state.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected snapshot:
```
run: { id: '037458ae-...', status: 'audit_ready' }
channel_profile rows: 1
video_intelligence_card rows: 6 — for [...]
canon_node rows: NN  (NN ≥ 25)
page_brief rows: MM  (MM ≥ 8)
segment counts by video: ...
```

- [ ] **Step 5: STOP — User review gate**

The plan pauses here. The user opens the audit URL, copies the markdown, and reviews. If the audit is genuinely agency-ready, we proceed to Phase 2 (skill extraction). If gaps remain, we identify them and patch in a tactical follow-up before Phase 2.

---

## Phase 2 (preserved here so we don't forget)

Once Phase 1 is approved by the user, Phase 2 begins. Goals:

1. **Extract recurring rubrics into Claude Code skills.** Each Phase 1 prompt embeds a domain rubric (e.g., "a framework MUST have a name + 3+ steps + when-to-use + sequencing rationale"). These rubrics get extracted into proper skills under `.claude/skills/pipeline/`:
   - `framework-extraction-rubric/` — schema + good/bad examples + anti-patterns
   - `editorial-strategy-rubric/` — persona archetypes, SEO intent map, CTA patterns
   - `cross-video-synthesis-rubric/` — when to merge vs split
   - `citation-chain-rubric/` — claim → segmentId binding rules
   - `voice-fingerprint-rubric/` — Hormozi-isms, when profanity hits, tone presets

2. **Build a `buildSystemPrompt(skill, mode)` harness** so the same skill content drives both dev-time understanding (when I'm coding the stage) AND runtime stage prompts (what the production agent sees). Single source of truth.

3. **Refactor offline scripts to skill-driven prompts.** The hand-written prompt blocks in `seed-audit-via-codex.ts`, `seed-editorial-strategy.ts`, etc., become `buildSystemPrompt(frameworkExtractionSkill, 'runtime')` calls.

4. **Wire skill-backed stages into the production canon_v1 pipeline.** Currently these live as offline scripts; in Phase 2 they become real pipeline stages with retry logic, cost tracking, and `generation_stage_run` row writes.

5. **Visual moments via Groq vision.** Add a `seed-visual-moments.ts` that runs `ffmpeg` against the 6 MP4s already in R2, samples frames at 10s intervals, sends each frame to Groq's `llama-3.2-90b-vision-preview` for triage + extracted-text + classification, and writes `visual_moment` rows. Mirrors the production `visual_context` stage but uses free Groq quota instead of metered OpenAI.

6. **Citation-chain validator stage.** Walk every claim in every canon node and page brief, verify it points at a real segmentId, emit a list of unsupported claims. Skill-driven from `citation-chain-rubric/`.

7. **Voice-fingerprint compliance check.** For each generated page (once we get to page_composition), score how closely the prose matches the voice fingerprint stored on the brief's `editorialStrategy`. Emit a list of violations.

8. **QA worksheet generator.** Auto-generate a checklist for the human editor: 10 sampled claims to spot-check, 3 sampled pages for voice compliance, the cluster topology to validate, the CTA strategy per page to confirm. Single markdown file the human signs at the bottom.

When that's all in, the SaaS pipeline can drive a creator hub from videos to publish with a single human-signed QA pass.

---

## Self-review

**Spec coverage:** Each editorial gap I called out in the prior audit critique is addressed by exactly one task in this plan:
- Canon under-extraction → Tasks 2, 3
- Reference artifacts missing → Task 4
- Cross-video synthesis missing → Task 5
- Reader journey missing → Task 6
- Brief catalog under-built → Task 7
- Editorial strategy layer missing → Task 8
- YouTube citation linking missing → Tasks 1, 9, 10
- Final verification → Task 11

**Placeholders:** None. Every step has executable commands, full code, exact expected output. The only thing the plan defers to Phase 2 is the skill extraction itself (intentionally — Phase 1 ships value first, Phase 2 generalises).

**Type consistency:** `RunAuditView`, `RawAuditPayload`, `CanonNodeOut`, `PageBriefOut`, `EditorialStrategy`, `SynthesisNodeOut`, `ReaderJourneyOut` — all defined consistently across files where used. The `pageBrief.payload.editorialStrategy` shape matches between Task 8 (writer) and any Phase 2 reader.

**Idempotency:** Every task is safely re-runnable. `link-uploads-to-youtube` checks current value before writing. `seed-reference-artifacts` clears prior reference rows. `seed-audit-via-codex --regen-canon` / `--regen-briefs` give explicit force-regen knobs. `seed-editorial-strategy` skips briefs that already have an `editorialStrategy`.

**Quota safety:** Zero OpenAI / Gemini API calls in the entire plan. All LLM work routes through Codex CLI. Only Groq is used (already wired) and only for transcription, which is already complete.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-hormozi-audit-agency-ready-phase1.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best when each task is well-isolated (which is the case here — every task has clear file boundaries and a verification step).

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
