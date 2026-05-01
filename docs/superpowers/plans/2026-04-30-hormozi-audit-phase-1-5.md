# Hormozi Audit → 95% Agency-Ready (Phase 1.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the Hormozi audit from ~70% to ~95% agency-ready by closing the six concrete gaps identified in the post-Phase-1 expert review: AI-skewed canon graph, missing money/sales/mindset frameworks, weak synthesis layer, missing editorial strategy on briefs, broken citation linkification on multi-ID/range formats, unrendered reference content (mistakes catalog, reader journey phases). Same target run as Phase 1: `037458ae-1439-4e56-a8da-aa967f2f5e1b`.

**Architecture:** The canon iterator's "+1 per iteration" yield + AI-VIC-heavy hint list produced a graph biased toward two videos. The fix is a **per-video round-robin canon pass** that processes ONE VIC at a time with a tight prompt (channel profile + that VIC's full payload + ONLY that VIC's named frameworks/definitions/lessons). Each call returns multiple nodes for that video, and the cross-video deduplication happens after. Editorial strategy gets folded into the brief generation prompt itself — no separate buggy stage. Markdown builder gains: payload-content rendering for reference nodes, expanded citation regex, cluster topology section. Visual moments stay deferred to Phase 2 (needs Groq vision wiring).

**Tech Stack:** Same as Phase 1 — TypeScript, Drizzle, PostgreSQL, Codex CLI v0.125.0, Next.js, Cloudflare R2.

**Phase 1.5 stop gate:** After Task 6, you re-open the audit page, click Copy audit, review the markdown for the broader topical coverage + rendered reference contents + clickable timestamps + cluster topology.

**After this:** Phase 2 begins (skill extraction, visual moments via Groq vision, citation-chain validator, voice-fingerprint compliance, QA worksheet generator).

---

## File Structure

**Modified files:**

- `packages/pipeline/src/scripts/seed-audit-via-codex.ts` — three changes:
  1. Add a per-video canon pass (`generatePerVideoCanonNodes`) that iterates each VIC independently with a tight must-cover hint list scoped to that one video
  2. Convert the synthesis stage from single-shot to iteration accumulator (target 3-5 distinct theses)
  3. Extend `buildBriefPrompt` and `PageBriefOut` so each brief is generated WITH `editorialStrategy` (persona + SEO + CTA + cluster + journey + voice) in a single Codex call — eliminates the separate `seed-editorial-strategy.ts` stage
- `apps/web/src/lib/audit/build-audit-markdown.ts` — three changes:
  1. Expand `linkifyCitations` regex to handle multi-ID brackets (`[id1, id2]`) and ms-range brackets (`[startMs-endMs]`, `[startMs-endMs, hexshort]`)
  2. Render `payload.mistakes` (mistake/why/correction triplets) for `reference_mistakes` topic nodes
  3. Render `payload.phases` (phaseNumber/name/readerState/primaryCanonNodeIds/nextStepWhen) for `reader_journey` playbook nodes
  4. Add a "Cluster Topology" section grouping briefs by `editorialStrategy.clusterRole.parentTopic`

**No new files this phase.** The deferred `seed-editorial-strategy.ts` stays committed but unused — it will be removed in a Phase 2 cleanup commit alongside the skill-extraction refactor.

---

## Task 1: Per-video round-robin canon pass

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

The current canon iterator feeds Codex all 6 VICs in every call (~50 KB prompt). Codex returns 1 node per call ("the best one"). With 15 iterations that's 15 nodes — and they skew toward whatever VIC's frameworks Codex sees as most prominent (in this run, the AI VICs).

The fix is a per-video pass: for each of the 6 VICs, feed Codex ONLY that VIC + the channel profile + ONLY that VIC's named frameworks/lessons/definitions list (typically 5-12 items per video). Codex's smaller prompt + tighter must-cover scope produces an array of multiple distinct nodes per call (we've seen this work on smaller prompts in Phase 1's smoke tests). Run 1-2 iterations per video. Target: 30-40 canon nodes total.

After the per-video pass, an optional cross-video dedup pass identifies duplicates by title and merges sources. (For Phase 1.5, we trust the title-dedup logic already in the accumulator; we do NOT need a separate merge pass.)

- [ ] **Step 1: Add `extractMustCoverFromOneVic` helper**

In `packages/pipeline/src/scripts/seed-audit-via-codex.ts`, near the existing `extractMustCoverFromVics`, add:

```ts
/**
 * Per-video must-cover extractor: pulls named frameworks, defined terms,
 * and high-weight lessons from a SINGLE VIC. Used by the per-video canon
 * pass so Codex focuses on canonizing one video's named library at a time.
 */
function extractMustCoverFromOneVic(
  vic: { videoId: string; title: string; payload: VicPayload },
): { frameworks: string[]; definitions: string[]; lessons: string[] } {
  const frameworks = new Set<string>();
  const definitions = new Set<string>();
  const lessons = new Set<string>();
  for (const f of vic.payload.frameworks ?? []) {
    const name = (f as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim().length > 0) frameworks.add(name.trim());
  }
  for (const t of vic.payload.termsDefined ?? []) {
    const term = (t as { term?: unknown }).term;
    if (typeof term === 'string' && term.trim().length > 0) definitions.add(term.trim());
  }
  for (const l of vic.payload.lessons ?? []) {
    if (typeof l === 'string' && l.trim().length > 20) lessons.add(l.trim().slice(0, 140));
  }
  return {
    frameworks: [...frameworks],
    definitions: [...definitions],
    lessons: [...lessons].slice(0, 12),
  };
}
```

- [ ] **Step 2: Add `buildPerVideoCanonPrompt`**

Add this new prompt builder right above `buildCanonPrompt`:

```ts
function buildPerVideoCanonPrompt(
  profile: ChannelProfilePayload,
  vic: { videoId: string; title: string; payload: VicPayload },
  alreadyHave: string[],
  remaining: number,
  mustCover: { frameworks: string[]; definitions: string[]; lessons: string[] },
): string {
  const remainingFrameworks = mustCover.frameworks.filter(
    (f) => !alreadyHave.some((t) => t.toLowerCase().includes(f.toLowerCase())),
  );
  const remainingDefinitions = mustCover.definitions.filter(
    (d) => !alreadyHave.some((t) => t.toLowerCase().includes(d.toLowerCase())),
  );
  return [
    'You are canon_architect. Extract canon nodes from ONE video\'s intelligence card.',
    '',
    '# Channel profile',
    JSON.stringify(profile, null, 2),
    '',
    `# Video: ${vic.title} (${vic.videoId})`,
    '',
    '# Video Intelligence Card (full payload)',
    JSON.stringify(vic.payload, null, 2),
    '',
    alreadyHave.length > 0
      ? `# Already-canonized titles from this video (do NOT repeat)\n${alreadyHave.map((t) => `- ${t}`).join('\n')}\n`
      : '',
    '# MUST-COVER LIST (every name from THIS video that deserves its own canon node)',
    '## Named frameworks not yet canonized:',
    remainingFrameworks.length > 0 ? remainingFrameworks.map((f) => `- ${f}`).join('\n') : '(all covered)',
    '## Defined terms not yet canonized:',
    remainingDefinitions.length > 0
      ? remainingDefinitions.slice(0, 8).map((d) => `- ${d}`).join('\n')
      : '(all covered)',
    '',
    '# Instructions',
    `Produce up to ${remaining} canon nodes from THIS video. Prefer items from the must-cover list. Each node must be a distinct, named, teachable unit (framework / playbook / lesson / principle / pattern / tactic / definition / aha_moment / quote / topic / example).`,
    '',
    'For EACH node, the payload MUST include (use null where the source genuinely doesn\'t address it):',
    '- title (use the EXACT name from the must-cover list when it applies)',
    '- summary (1-2 sentences)',
    '- whenToUse (1-2 sentences)',
    '- whenNotToUse (1-2 sentences OR null)',
    '- commonMistake (1 sentence OR null)',
    '- successSignal (1 sentence)',
    '- preconditions (string[]): for frameworks/playbooks/lessons',
    '- steps (string[]): for frameworks/playbooks',
    '- sequencingRationale (string OR null)',
    '- failureModes (string[])',
    '- examples (string[])',
    '- definition (string): for definition-type nodes',
    '',
    'Set sourceVideoIds to ["' + vic.videoId + '"] and origin to "single_video".',
    '',
    '# OUTPUT FORMAT — CRITICAL',
    `Respond with a single JSON ARRAY of AT LEAST ${Math.min(remaining, 5)} canon node objects. First char \`[\`, last char \`]\`. NEVER a single object — wrap as \`[{...}]\`. No preamble, no markdown fences.`,
    '',
    'Skeleton:',
    '[',
    '  { "type": "framework"|"lesson"|"playbook"|"principle"|"pattern"|"tactic"|"definition"|"aha_moment"|"quote"|"topic"|"example",',
    '    "payload": { "title": "...", "summary": "...", "whenToUse": "...", "whenNotToUse": null, "commonMistake": null, "successSignal": "...", "preconditions": [], "steps": [], "sequencingRationale": null, "failureModes": [], "examples": [] },',
    `    "sourceVideoIds": ["${vic.videoId}"],`,
    '    "origin": "single_video",',
    '    "confidenceScore": 0-100, "pageWorthinessScore": 0-100, "specificityScore": 0-100, "creatorUniquenessScore": 0-100,',
    '    "evidenceQuality": "high"|"medium"|"low" },',
    '  { ... another distinct node ... }',
    ']',
    '',
    `Begin with \`[\` and produce ${Math.min(remaining, 5)}-${remaining} entries.`,
  ].join('\n');
}
```

- [ ] **Step 3: Add `generatePerVideoCanonNodes`**

Below the new prompt builder, add:

```ts
/**
 * Per-video canon pass: for each VIC, run iterations against ONE video's
 * named library. Smaller prompt + tighter must-cover = better Codex yield
 * per call. Accumulates with title-dedup the same way the cross-video
 * accumulator does.
 */
async function generatePerVideoCanonNodes(
  profile: ChannelProfilePayload,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): Promise<CanonNodeOut[]> {
  const PER_VIDEO_TARGET = 6;
  const PER_VIDEO_MAX_ITERATIONS = 4;
  const accumulated: CanonNodeOut[] = [];
  const seenTitles = new Set<string>();

  for (let vIdx = 0; vIdx < vics.length; vIdx += 1) {
    const vic = vics[vIdx]!;
    const mustCover = extractMustCoverFromOneVic(vic);
    const totalNamed = mustCover.frameworks.length + mustCover.definitions.length;
    console.info(`[codex-audit] per-video canon (${vIdx + 1}/${vics.length}) ${vic.title} — must-cover: ${mustCover.frameworks.length} frameworks, ${mustCover.definitions.length} definitions`);

    if (totalNamed === 0) {
      console.warn(`[codex-audit] per-video canon: ${vic.videoId} has no named frameworks/definitions; skipping`);
      continue;
    }

    const myTitles: string[] = [];
    for (let i = 0; i < PER_VIDEO_MAX_ITERATIONS; i += 1) {
      const remaining = PER_VIDEO_TARGET - myTitles.length;
      if (remaining <= 0) break;
      const prompt = buildPerVideoCanonPrompt(profile, vic, [...myTitles], remaining, mustCover);
      console.info(`[codex-audit]   iter ${i + 1}/${PER_VIDEO_MAX_ITERATIONS} (have ${myTitles.length} for this video, asking for up to ${remaining} more)…`);
      let batch: CanonNodeOut[];
      try {
        batch = await codexJson<CanonNodeOut[]>(prompt, `pv_canon_${vic.videoId}_iter_${i + 1}`, 'array', CANON_TIMEOUT_MS);
      } catch (err) {
        console.warn(`[codex-audit]   iter ${i + 1} failed: ${(err as Error).message}`);
        continue;
      }
      let added = 0;
      for (const node of batch) {
        const title = node.payload?.title?.toString().trim();
        if (!title) continue;
        const lower = title.toLowerCase();
        if (seenTitles.has(lower)) continue;
        seenTitles.add(lower);
        myTitles.push(title);
        accumulated.push(node);
        added += 1;
      }
      console.info(`[codex-audit]   iter ${i + 1}: +${added} new (this video=${myTitles.length}, total=${accumulated.length})`);
      if (added === 0) break;
    }
  }

  console.info(`[codex-audit] per-video canon synthesis complete: ${accumulated.length} distinct nodes`);
  return accumulated;
}
```

- [ ] **Step 4: Wire `--per-video-canon` flag into main()**

In `main()`, near the other flag-parsing lines (`regenCanon`, `regenBriefs`), add:

```ts
const perVideoCanon = process.argv.includes('--per-video-canon');
```

In the canon resume/regenerate branching, add the per-video path. Find the existing `else { ... await generateCanonNodes(...) ... }` branch (the regen/fresh-generate path). Replace it with:

```ts
} else {
  if (regenCanon && existingCanon.length > 0) {
    console.info(`[codex-audit] --regen-canon: deleting ${existingCanon.length} existing canon nodes for run ${runId}`);
    await db.delete(canonNode).where(eq(canonNode.runId, runId));
    await db.delete(pageBrief).where(eq(pageBrief.runId, runId));
  }
  const canonNodesOut = perVideoCanon
    ? await generatePerVideoCanonNodes(profilePayload, vicResults)
    : await generateCanonNodes(profilePayload, vicResults);
  // ...existing write-loop unchanged...
}
```

(Keep the existing `for (const node of canonNodesOut) { ... await db.insert(canonNode)... }` loop body as-is.)

- [ ] **Step 5: Typecheck**

From `packages/pipeline`:
```bash
pnpm typecheck
```
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): per-video canon pass for broader topical coverage

The cross-video canon iterator was returning ~1 node per call because the
prompt was huge (all 6 VICs concatenated, ~50 KB) and Codex consistently
gave 'the best one' instead of an array. The per-video pass shrinks each
prompt to ONE VIC + that VIC's named-framework/definition list, so Codex
returns 3-5 nodes per call against a tight must-cover scope.

For 6 videos × ~6 nodes/video, target is 30-40 canon nodes. Title-dedup
runs across the accumulator so genuine cross-video patterns still get
captured once.

Add --per-video-canon flag opting into the new path. Old path stays as
default for backward compatibility."
```

---

## Task 2: Iterating synthesis stage

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

The synthesis stage currently makes one Codex call asking for 3-5 unified theories. Codex returns 1 ("AI Operator Theory of Leverage") which the lenient parser wraps. Fix: same accumulator pattern as canon, with anti-duplicate hint.

- [ ] **Step 1: Replace `generateSynthesisNodes` body with iteration accumulator**

Find the existing `generateSynthesisNodes` function. Keep its `SynthesisNodeOut` interface and the existing prompt builder LOGIC, but wrap it in an iteration loop. Replace the function body with:

```ts
async function generateSynthesisNodes(
  profile: ChannelProfilePayload,
  canonNodesWithIds: Array<{ id: string; type: string; payload: Record<string, unknown> }>,
  vics: Array<{ videoId: string; title: string; payload: VicPayload }>,
): Promise<SynthesisNodeOut[]> {
  const TARGET = 5;
  const MAX_ITERATIONS = 6;
  const accumulated: SynthesisNodeOut[] = [];
  const seenTitles = new Set<string>();

  const canonBlock = canonNodesWithIds
    .map((n) => `### [${n.id}] ${n.type} · ${(n.payload as { title?: string }).title ?? '(Untitled)'}\n${(n.payload as { summary?: string }).summary ?? ''}`)
    .join('\n\n');
  const vicTitles = vics.map((v) => `- ${v.videoId}: ${v.title}`).join('\n');

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const remaining = TARGET - accumulated.length;
    if (remaining <= 0) break;
    const alreadyBlock = accumulated.length > 0
      ? `\n\n# Already-generated synthesis theories (DO NOT repeat — produce DIFFERENT cross-cutting theories)\n${[...seenTitles].map((t) => `- ${t}`).join('\n')}`
      : '';
    const prompt = [
      'You are cross_video_synthesizer. Identify cross-cutting unified theories or meta-narratives that thread through this creator\'s entire run.',
      '',
      '# Channel profile',
      JSON.stringify(profile, null, 2),
      '',
      `# Source videos (${vics.length})`,
      vicTitles,
      '',
      `# Canon nodes already extracted (${canonNodesWithIds.length})`,
      canonBlock,
      alreadyBlock,
      '',
      '# Instructions',
      `Find up to ${remaining} more DISTINCT meta-claims that connect 3+ existing canon nodes under a single unifying argument. Examples of the SHAPE we want:`,
      '- "The Money/Cashflow Sequence" — connects First-100K Roadmap, Premium 1-on-1 Bootstrap, Expensive-to-Few, etc.',
      '- "The Anti-Comfort Theory" — connects Cringe Reframe, Frustration Tolerance, Passion Reality Test, Document the Comeback under "discomfort is the input."',
      '- "Pricing-and-Positioning Thread" — connects Expensive-to-Few + Premium 1-on-1 + Value Deconstruction + Anchor-and-Downsell + Three Frames under "every offer is an asymmetric bet."',
      '',
      'Each synthesis must connect at least 3 canon nodes BY ID from the canon list above.',
      '',
      '# OUTPUT FORMAT — CRITICAL',
      `Respond with a single JSON ARRAY of AT LEAST ${Math.min(remaining, 2)} synthesis objects. First char \`[\`, last char \`]\`. NEVER a single object — wrap as \`[{...}]\`. No preamble, no markdown fences.`,
      '',
      'Skeleton:',
      '[',
      '  { "title": "...",',
      '    "summary": "1-2 sentences naming the unifying argument",',
      '    "unifyingThread": "1 sentence — the single thread connecting the children",',
      '    "childCanonNodeIds": ["cn_..."],  // 3+ IDs from the canon list above',
      '    "whyItMatters": "1-2 sentences — why a hub reader benefits",',
      '    "pageWorthinessScore": 0-100 },',
      '  { ... another distinct synthesis ... }',
      ']',
    ].join('\n');

    console.info(`[codex-audit] synthesis iteration ${i + 1}/${MAX_ITERATIONS} (have ${accumulated.length}, asking for up to ${remaining} more)…`);
    let batch: SynthesisNodeOut[];
    try {
      batch = await codexJson<SynthesisNodeOut[]>(prompt, `synthesis_iter_${i + 1}`, 'array', DEFAULT_TIMEOUT_MS);
    } catch (err) {
      console.warn(`[codex-audit] synthesis iteration ${i + 1} failed: ${(err as Error).message}`);
      continue;
    }
    let added = 0;
    for (const s of batch) {
      const title = s.title?.trim();
      if (!title) continue;
      const lower = title.toLowerCase();
      if (seenTitles.has(lower)) continue;
      seenTitles.add(lower);
      accumulated.push(s);
      added += 1;
    }
    console.info(`[codex-audit] synthesis iteration ${i + 1}: +${added} new (total ${accumulated.length})`);
    if (added === 0) break;
  }

  console.info(`[codex-audit] synthesis complete: ${accumulated.length} distinct nodes`);
  return accumulated;
}
```

- [ ] **Step 2: Update the synthesis-write block in main() to also support `--regen-synthesis`**

Find the existing synthesis block in `main()`. Add a `regenSynthesis` flag at the top of `main()`:

```ts
const regenSynthesis = process.argv.includes('--regen-synthesis');
```

In the synthesis block, change the gate. Find:

```ts
if (!synthesisAlreadyExists) {
```

Replace with:

```ts
if (!synthesisAlreadyExists || regenSynthesis) {
  if (regenSynthesis && synthesisAlreadyExists) {
    // Delete only the synthesis-kind topic nodes (preserve reference_* topic nodes)
    const toDelete = await db
      .select({ id: canonNode.id, payload: canonNode.payload })
      .from(canonNode)
      .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));
    const deleteIds = toDelete
      .filter((r) => (r.payload as { kind?: string })?.kind === 'synthesis')
      .map((r) => r.id);
    if (deleteIds.length > 0) {
      await db.delete(canonNode).where(inArray(canonNode.id, deleteIds));
      console.info(`[codex-audit] --regen-synthesis: deleted ${deleteIds.length} prior synthesis nodes`);
    }
  }
```

(Make sure `inArray` is imported from `@creatorcanon/db` — it likely already is.)

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): synthesis stage uses iteration accumulator (target 3-5 theses)

Same pattern as the canon iterator — each iteration sees the
already-generated synthesis titles and is told to produce different
cross-cutting theories. Lenient parser still wraps single-object
responses, but the loop accumulates across multiple calls so we end
with 3-5 distinct theses instead of just one.

Add --regen-synthesis flag that selectively deletes only the synthesis
topic nodes (preserving reference_* artifacts) before regenerating."
```

---

## Task 3: Brief generation produces editorial strategy in one call

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

Replace the broken separate `seed-editorial-strategy.ts` flow by extending the brief generation prompt to include the strategy fields. Each brief comes out of Codex with `editorialStrategy` already attached. No second Codex pass needed.

- [ ] **Step 1: Extend `PageBriefOut` type**

Find the `PageBriefOut` interface in `seed-audit-via-codex.ts`. Add the optional `editorialStrategy` field:

```ts
interface PageBriefOut {
  pageTitle: string;
  pageType: 'topic' | 'framework' | 'lesson' | 'playbook' | 'example_collection' | 'definition' | 'principle';
  audienceQuestion: string;
  openingHook: string;
  slug: string;
  outline: Array<{ sectionTitle: string; canonNodeIds: string[]; intent: string }>;
  primaryCanonNodeIds: string[];
  supportingCanonNodeIds: string[];
  pageWorthinessScore: number;
  position: number;
  editorialStrategy?: {
    persona: { name: string; context: string; objection: string; proofThatHits: string };
    seo: { primaryKeyword: string; intent: 'informational' | 'transactional' | 'navigational' | 'commercial'; titleTemplate: string; metaDescription: string };
    cta: { primary: string; secondary: string };
    clusterRole: { tier: 'pillar' | 'spoke'; parentTopic: string | null; siblingSlugs: string[] };
    journeyPhase: 1 | 2 | 3 | 4 | 5;
    voiceFingerprint: { profanityAllowed: boolean; tonePreset: string; preserveTerms: string[] };
  };
}
```

- [ ] **Step 2: Extend `buildBriefPrompt` to require editorial strategy fields**

Find `buildBriefPrompt`. In the schema/skeleton section, replace the existing skeleton object with:

```ts
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
    '    "position": 0,',
    '    "editorialStrategy": {',
    '      "persona": { "name": "...", "context": "1 sentence about the reader", "objection": "1 sentence — biggest pushback", "proofThatHits": "1 sentence — which specific Hormozi credential/number/story will land" },',
    '      "seo": { "primaryKeyword": "what someone types in Google", "intent": "informational|transactional|navigational|commercial", "titleTemplate": "60-70 char SEO title", "metaDescription": "150-160 char meta description" },',
    '      "cta": { "primary": "main next-action", "secondary": "fallback next-action" },',
    '      "clusterRole": { "tier": "pillar"|"spoke", "parentTopic": "kebab-slug or null if pillar", "siblingSlugs": ["..."] },',
    '      "journeyPhase": 1-5,  // 1=Survival, 2=Cashflow, 3=Scale, 4=Leverage, 5=Investing',
    '      "voiceFingerprint": { "profanityAllowed": true|false, "tonePreset": "blunt-tactical"|"warm-coaching"|"analytical-detached", "preserveTerms": ["1-1-1 rule", "..."] }',
    '    } },',
    '  { ... }',
    ']',
```

Also add a single line above the skeleton:
```ts
    '',
    'Each brief MUST include the full editorialStrategy block — persona + seo + cta + clusterRole + journeyPhase + voiceFingerprint. Do NOT omit it.',
    '',
```

- [ ] **Step 3: Wire siblingSlugs into the prompt**

The `clusterRole.siblingSlugs` field needs awareness of other briefs' slugs. Since brief generation happens iteratively and we don't know all slugs upfront, the simplest approach: have Codex generate slugs that fit the natural cluster topology (it can see the canon nodes), and we patch siblingSlugs in a second pass during the write-loop. Actually that adds complexity — instead, just trust Codex to pick siblingSlugs based on the canon graph it sees. Document the limitation in a comment:

```ts
    // NOTE: siblingSlugs come from Codex's best guess given the canon graph;
    // a future Phase 2 pass could reconcile after all briefs are written.
```

(Add this comment near `editorialStrategy: ...` in the schema description.)

- [ ] **Step 4: Confirm the brief-write loop accepts the new shape**

Find the brief-write loop in `main()`. The line `const payload = { ...b, primaryCanonNodeIds: primary, supportingCanonNodeIds: supporting };` already spreads `b` which now includes `editorialStrategy` if Codex emitted it — no change needed. The DB INSERT writes `payload as Record<string, unknown>` which includes the strategy automatically.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-via-codex.ts
git commit -m "feat(audit-seed): bake editorialStrategy into brief generation prompt

The separate seed-editorial-strategy.ts script bailed silently after
brief 1 in Phase 1 (root cause unknown — likely Windows shell-spawn /
buffering). Eliminate the failure point by having brief generation
produce persona/SEO/CTA/cluster/journey/voice in the same Codex call
as the brief itself.

Each brief now arrives with editorialStrategy populated. No second
script needed. The seed-editorial-strategy.ts file stays in tree for
now and gets removed in the Phase 2 cleanup commit."
```

---

## Task 4: Markdown builder — render reference contents + expand citation regex + cluster topology

**Files:**
- Modify: `apps/web/src/lib/audit/build-audit-markdown.ts`

Three improvements to the markdown export.

- [ ] **Step 1: Render `payload.mistakes` for `reference_mistakes` topic nodes**

Find the loop in `buildAuditMarkdown` that renders canon nodes by type. For `topic` nodes, the existing code probably renders title + summary + (in the linkifier) maybe more. Locate where the per-canon-node body is rendered and extend it to handle the `kind` switch:

After the meta line and summary for each canon node, add:

```ts
const payloadKind = (n.payload as { kind?: string })?.kind;
if (payloadKind === 'reference_mistakes') {
  const mistakes = (n.payload as { mistakes?: Array<{ mistake: string; why: string; correction: string }> }).mistakes ?? [];
  if (mistakes.length > 0) {
    lines.push(``);
    lines.push(`**Mistakes (${mistakes.length}):**`);
    for (const m of mistakes) {
      lines.push(`- **Mistake:** ${m.mistake}`);
      lines.push(`  - _Why:_ ${m.why}`);
      lines.push(`  - _Correction:_ ${m.correction}`);
    }
    lines.push(``);
  }
}
```

(Place this inside the per-canon-node rendering block, after whatever currently renders the summary/meta but before moving to the next node.)

- [ ] **Step 2: Render `payload.phases` for `reader_journey` playbook nodes**

In the same per-canon-node rendering block, also handle the journey:

```ts
if (payloadKind === 'reader_journey') {
  const phases = (n.payload as { phases?: Array<{ phaseNumber: number; name: string; readerState: string; primaryCanonNodeIds: string[]; nextStepWhen: string }> }).phases ?? [];
  if (phases.length > 0) {
    lines.push(``);
    lines.push(`**Phases (${phases.length}):**`);
    for (const phase of phases) {
      lines.push(``);
      lines.push(`- **Phase ${phase.phaseNumber}: ${phase.name}**`);
      lines.push(`  - _Reader state:_ ${phase.readerState}`);
      lines.push(`  - _Primary canon nodes:_ ${phase.primaryCanonNodeIds.join(', ')}`);
      lines.push(`  - _Next step when:_ ${phase.nextStepWhen}`);
    }
    lines.push(``);
  }
}
```

- [ ] **Step 3: Expand `linkifyCitations` regex to handle multi-ID and ms-range formats**

Find `linkifyCitations`. Replace the function body with:

```ts
function linkifyCitations(
  markdown: string,
  segmentMap: Record<string, { videoId: string; startMs: number }>,
  youtubeIdByVideoId: Record<string, string | null>,
): string {
  // 1. UUID-shaped or 32+-char hex IDs in [...]
  const uuidPattern = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32})\]/gi;
  let out = markdown.replace(uuidPattern, (whole, id: string) => {
    const seg = segmentMap[id];
    if (!seg) return whole;
    const yt = youtubeIdByVideoId[seg.videoId];
    if (!yt) return `[${formatYoutubeTs(seg.startMs)}]`;
    return `[${formatYoutubeTs(seg.startMs)}](${youtubeWatchUrl(yt, seg.startMs)})`;
  });

  // 2. Multi-ID brackets: [uuid1, uuid2, ...]. We linkify each that resolves.
  const multiIdPattern = /\[((?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:,\s*)?)+)\]/gi;
  out = out.replace(multiIdPattern, (whole, ids: string) => {
    const links = ids
      .split(/,\s*/)
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => {
        const seg = segmentMap[id];
        if (!seg) return null;
        const yt = youtubeIdByVideoId[seg.videoId];
        const ts = formatYoutubeTs(seg.startMs);
        return yt ? `[${ts}](${youtubeWatchUrl(yt, seg.startMs)})` : `[${ts}]`;
      })
      .filter(Boolean);
    return links.length > 0 ? links.join(', ') : whole;
  });

  // 3. Pure ms-range brackets: [123456ms-789012ms] → linkify the start time
  //    when we can resolve the segment. Without a segmentId, we fall back
  //    to formatting the start as m:ss (no link, since we don't know the
  //    video). Only useful when the citation is inline within a section
  //    that already names the video.
  const msRangePattern = /\[(\d+)ms-(\d+)ms\]/g;
  out = out.replace(msRangePattern, (whole, startMs: string) => {
    const ms = parseInt(startMs, 10);
    if (!Number.isFinite(ms)) return whole;
    return `[${formatYoutubeTs(ms)}]`;
  });

  // 4. Mixed time-range + short hex: [2:46-3:26, ae861cea] — leave the
  //    h:m:s range as-is, drop the hex (it's a partial UUID we can't
  //    resolve). Express the result as just the time range.
  const mixedPattern = /\[(\d+:\d+(?:-\d+:\d+)?),\s*[a-f0-9]+(?:\/[a-f0-9]+)*\]/g;
  out = out.replace(mixedPattern, (_whole, timeRange: string) => `[${timeRange}]`);

  return out;
}
```

- [ ] **Step 4: Add a "Cluster Topology" section grouping briefs by parentTopic**

After the existing "Proposed Hub Pages — N" section in `buildAuditMarkdown`, add a new section:

```ts
// ── Cluster Topology ───────────────────────────────────
const briefsWithStrategy = view.pageBriefs.filter((b) => {
  const strategy = (b.payload as { editorialStrategy?: unknown }).editorialStrategy;
  return strategy != null;
});
if (briefsWithStrategy.length > 0) {
  lines.push(``);
  lines.push(`## Cluster Topology — ${briefsWithStrategy.length} briefs with editorial strategy`);
  lines.push(``);
  // Group by parentTopic; "null" parents are pillars
  const byParent = new Map<string, typeof briefsWithStrategy>();
  for (const b of briefsWithStrategy) {
    const strategy = (b.payload as { editorialStrategy?: { clusterRole?: { tier?: string; parentTopic?: string | null } } }).editorialStrategy;
    const tier = strategy?.clusterRole?.tier ?? 'spoke';
    const parent = tier === 'pillar' ? '(pillars)' : (strategy?.clusterRole?.parentTopic ?? '(orphan)');
    const arr = byParent.get(parent) ?? [];
    arr.push(b);
    byParent.set(parent, arr);
  }
  // Pillars first, then named clusters, then orphans
  const sortedKeys = ['(pillars)', ...[...byParent.keys()].filter((k) => k !== '(pillars)' && k !== '(orphan)').sort(), '(orphan)'].filter((k) => byParent.has(k));
  for (const key of sortedKeys) {
    const arr = byParent.get(key)!;
    lines.push(`### ${key === '(pillars)' ? 'Pillar pages' : key === '(orphan)' ? 'Unclustered (orphans)' : `Cluster: ${key}`} (${arr.length})`);
    lines.push(``);
    for (const b of arr) {
      const p = b.payload as { pageTitle?: string; slug?: string; editorialStrategy?: { journeyPhase?: number; persona?: { name?: string }; seo?: { primaryKeyword?: string }; cta?: { primary?: string } } };
      const phase = p.editorialStrategy?.journeyPhase;
      const persona = p.editorialStrategy?.persona?.name;
      const keyword = p.editorialStrategy?.seo?.primaryKeyword;
      const cta = p.editorialStrategy?.cta?.primary;
      lines.push(`- **${p.pageTitle ?? '(Untitled)'}** \`${p.slug ?? '?'}\``);
      if (phase != null) lines.push(`  - _Phase ${phase}_${persona ? ` · _Persona: ${persona}_` : ''}`);
      if (keyword) lines.push(`  - _SEO target: \`${keyword}\`_`);
      if (cta) lines.push(`  - _CTA: ${cta}_`);
    }
    lines.push(``);
  }
}
```

- [ ] **Step 5: Typecheck**

From `apps/web`:
```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/audit/build-audit-markdown.ts
git commit -m "feat(audit-export): render reference contents + expand citation regex + cluster topology

Three markdown-builder improvements:

1. reference_mistakes nodes now render their full mistake/why/correction
   triplets inline. Previously the node existed but said '30 mistakes'
   without showing them.

2. reader_journey nodes now render their full phase ladder with reader
   state, primary canon nodes, and next-step-when criteria per phase.

3. Citation linkifier now handles multi-ID brackets ([uuid1, uuid2]) and
   ms-range brackets ([123456ms-789012ms]). UUID regex tightened to
   {32} length to avoid false positives on hex strings in quotes.

4. New 'Cluster Topology' section groups briefs by parentTopic and shows
   journey phase + persona + SEO target + CTA per page. Surfaces the
   editorial architecture an agency would consume."
```

---

## Task 5: Operator runs (regenerate everything end-to-end)

**Files:** none modified

This is a single-pass operator step that re-runs the pipeline scripts using the new code from Tasks 1-3. The Phase 1 reference artifacts will get cleared by `--regen-canon` so we re-run them too.

- [ ] **Step 1: Re-run canon with `--regen-canon --per-video-canon`**

From `packages/pipeline`:
```bash
./node_modules/.bin/tsx ./src/scripts/seed-audit-via-codex.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b --regen-canon --per-video-canon
```

This deletes existing canon + briefs, runs the per-video canon pass (~6 videos × ~2-4 iterations = 12-24 Codex calls, ~30-60 min wall clock), then runs the iterating synthesis stage (target 3-5 nodes), the reader journey, and the brief generation with editorial strategy baked in.

Watch for these milestones:
- `[codex-audit] per-video canon synthesis complete: NN distinct nodes` (NN ≥ 30)
- `[codex-audit] synthesis complete: NN distinct nodes` (NN ≥ 3)
- `[codex-audit] wrote Reader Journey Card with M phases`
- `[codex-audit] page brief synthesis complete: NN briefs` (NN ≥ 12)
- `[codex-audit] Run ... → audit_ready`

- [ ] **Step 2: Re-run reference artifacts**

The `--regen-canon` flag wiped all canon nodes including the 5 reference nodes. Restore them:

```bash
./node_modules/.bin/tsx ./src/scripts/seed-reference-artifacts.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected: 5 reference nodes written.

- [ ] **Step 3: Verify final state**

```bash
./node_modules/.bin/tsx ./src/scripts/inspect-audit-state.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b
```

Expected:
- `channel_profile rows: 1`
- `video_intelligence_card rows: 6`
- `canon_node rows: NN` where NN ≥ 38 (target 30 from per-video canon + 5 reference + 3 synthesis + 1 reader journey ≈ 39)
- `page_brief rows: NN` where NN ≥ 12

If any of those fall below the targets, either re-run with the appropriate `--regen-*` flag or accept the result and document the gap.

- [ ] **Step 4: Spot-check editorial strategy on a sample brief**

```bash
./node_modules/.bin/tsx -e "
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './src/env-files';
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const rows = await db.select({ payload: pageBrief.payload }).from(pageBrief).where(eq(pageBrief.runId, '037458ae-1439-4e56-a8da-aa967f2f5e1b')).limit(3);
  for (const r of rows) {
    const p = r.payload as any;
    console.log('---', p.pageTitle, '---');
    console.log('  persona:', p.editorialStrategy?.persona?.name);
    console.log('  phase:', p.editorialStrategy?.journeyPhase);
    console.log('  tier:', p.editorialStrategy?.clusterRole?.tier);
    console.log('  SEO:', p.editorialStrategy?.seo?.primaryKeyword);
    console.log('  CTA:', p.editorialStrategy?.cta?.primary);
  }
  await closeDb();
})();
" 2>&1 | tail -25
```

Expected: each of the 3 sampled briefs prints non-undefined values for persona, phase, tier, SEO, and CTA. If they're all undefined, the brief generation prompt change in Task 3 didn't produce strategy fields and we need to re-prompt or re-run.

---

## Task 6: Final user-review handoff

**Files:** none modified

- [ ] **Step 1: Restart dev server (if down)**

If the Next.js dev server is no longer running:
```bash
cd apps/web && pnpm dev
```
Wait for `✓ Ready in N s`.

- [ ] **Step 2: Open the audit page**

`http://localhost:3000/app/projects/ca713f3c-86d3-4430-8003-122d70cb4041/runs/037458ae-1439-4e56-a8da-aa967f2f5e1b/audit`

Verify:
- Knowledge Graph section has ≥ 38 nodes spanning all 4 thematic clusters (AI Operator, Money/Pricing, Sales/Offers, Mindset/Execution)
- Reader Journey Card shows the 5 phases with reader state, primary canon node IDs, and next-step-when fully rendered
- Mistakes Catalog node shows the 30 mistake/why/correction triplets inline (not just "30 mistakes aggregated")
- 3-5 synthesis nodes appear under topic
- Proposed Hub Pages section has 12-22 briefs with editorialStrategy visible somewhere (in the new Cluster Topology section, at minimum)
- Cluster Topology section appears after Proposed Hub Pages, grouping briefs by pillar/spoke parentTopic with phase/persona/SEO/CTA per page

- [ ] **Step 3: Click "Copy audit" and paste the markdown into a text editor**

Spot-check:
- Citations: every UUID-shaped citation in the per-VIC sections is now a clickable timestamp (or fall-back `[m:ss]`); no raw UUIDs visible
- Multi-ID citations like `[id1, id2]` render as comma-separated timestamp links
- ms-range citations like `[123456ms-789012ms]` render as `[m:ss]`
- Reference Mistakes Catalog: the 30 triplets are spelled out
- Reader Journey Card: the 5 phases are spelled out

- [ ] **Step 4: STOP — User review gate**

The audit is now at ~95% agency-ready. Verdict comes from the user.

If gaps remain (specific frameworks still missing, brief topology imbalanced, citations broken):
- Identify the specific gap
- File a tactical follow-up task BEFORE Phase 2

If approved:
- Tag `phase-1.5-shipped` on the current commit
- Begin **Phase 2** (skill extraction, Groq vision for visual moments, citation-chain validator, voice-fingerprint compliance, QA worksheet generator)

---

## Self-Review

**Spec coverage:** All 6 gaps from the post-Phase-1 expert review are addressed:

1. AI-skewed canon graph → Task 1 (per-video round-robin) + Task 5 (run with `--regen-canon --per-video-canon`)
2. Missing money/sales/mindset frameworks → Tasks 1+5 (per-video must-cover hint covers each VIC's named library)
3. Weak synthesis layer → Task 2 (iteration accumulator)
4. Missing editorial strategy on briefs → Task 3 (baked into brief prompt)
5. Broken citation linkification → Task 4 (expanded regex)
6. Unrendered reference content → Task 4 (mistakes + phases rendering)

Visual moments and skill extraction stay deferred to Phase 2 (deliberate scope).

**Placeholders:** None. Each task has executable commands, full code snippets, exact expected output. The brief-prompt extension shows the full skeleton; the markdown builder fixes show the full regex + render blocks.

**Type consistency:** `PageBriefOut.editorialStrategy` shape matches what's described in the prompt and what's read by `build-audit-markdown.ts` for the Cluster Topology section. `SynthesisNodeOut` and the iteration loop signature are consistent with Task 2 of Phase 1's pattern.

**Idempotency:** All flags compose cleanly. `--regen-canon` deletes canon + briefs (existing behavior). `--regen-synthesis` selectively deletes synthesis-kind topic nodes (preserving reference artifacts). `--per-video-canon` is additive — toggles which generator runs. Re-running Task 5 multiple times is safe.

**Quota safety:** Zero OpenAI / Gemini API calls. All LLM work via Codex CLI. Groq remains untouched (transcription is durable).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-hormozi-audit-phase-1-5.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per code task with batched code review at the end (matching the user's Phase 1 working style: "rigorous review per phase + autonomous between stop gates").

**2. Inline Execution** — execute tasks in this session.

Going with Subagent-Driven, mirroring Phase 1's pattern.
