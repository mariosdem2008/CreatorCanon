# Phase A — Operator-Coach Product Synthesis Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the product synthesis layer that converts a creator's audit substrate into an operator-coach-shaped product bundle. Ships 8 composer agents + product-bundle schema + synthesis API + first archetype shell adapter. Validates on the existing 4 operator-coach creators in the cohort (Hormozi, Huber, Clouse, Jordan).

**Architecture:** Composer agents consume the audit substrate (ChannelProfile_v2, CanonNode, PageBrief, EvidenceRegistry, WorkshopClip) and emit typed product components. A synthesis runner orchestrates them in parallel where possible. Output is a `ProductBundle` — a single typed JSON document persisted to the DB and consumable by the renderer/shell.

**Tech Stack:** TypeScript, Drizzle ORM with new JSONB tables, Codex CLI (cheaper-per-call than audit because composer scope is tighter), node:test, existing pipeline patterns.

**Owner:** Claude (per meta-plan: backend semantic engineering).

**Dependencies:** main (Phase 11 + Creator Manual integration). Cohort runs from Phase 8/9/10/11 are the test substrate.

**Estimated weeks:** 12.

**Spec source:** Inferred from the 2026-05-02 architectural deep dive in conversation; meta-plan at `docs/superpowers/plans/2026-05-02-meta-phase-a-thru-k-execution-plan.md`.

---

## Where we're starting

- `origin/main` HEAD = `1a64d8d` (Phase 9-11 quality lift merged 2026-05-02)
- 7-creator cohort exists with full audit substrate; 4 are operator-coach archetype:
  - Jordan Platten (`a8a05629-d400-4f71-a231-99614615521c`)
  - Alex Hormozi (`037458ae-1439-4e56-a8da-aa967f2f5e1b`)
  - Jay Clouse (`a9c221d4-a482-4bc3-8e63-3aca0af05a5b`) — note: instructional-craft technically, but operator-coach-flavored; useful test
  - Nick Huber (`10c7b35f-7f57-43ed-ae70-fac3e5cd4581`)
- Phase 11 helpers reusable: `detectRefusalPattern`, `fuzzyPhraseInText`, `countCitations`, `citationFloor`, `filterAndOrderCandidates`, `ensureDbHealthy`, `voiceRulesPrompt`, `isVoiceMode`.
- Codex CLI provider exists (PIPELINE_OPENAI_PROVIDER=codex_cli) for dev-only runs; production uses openai_api.

## Where we land

- `packages/synthesis/` package with 8 composer modules + a runner.
- `synthesisRun` + `productBundle` DB tables (migration 0017 — first one after Codex's 0016).
- `POST /api/runs/[runId]/synthesize` + `GET /api/runs/[runId]/synthesis` API endpoints.
- Operator-coach shell at `apps/web/src/components/hub/shells/operator-coach/` consuming the product bundle.
- All 4 operator-coach cohort creators have synthesis runs; spot-checked qualitatively.
- Headline visible product: **Action Plan Generator** rendered on each creator's hub home page.

---

## Pre-execution sanity check (Step 0 — REQUIRED before any task)

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git fetch origin --prune
git switch main
git pull --ff-only

# Confirm Phase 11 is in main
git log origin/main --oneline -3 | grep -q "1a64d8d" && echo "Phase 11 present" || echo "MISSING"

# Worktree for execution
git worktree add ".worktrees/phase-a-execute" -b "feat/phase-a-operator-coach-synthesis" origin/main
cd ".worktrees/phase-a-execute"
cp ../../.env .
cp ../../apps/web/.env.local apps/web/
pnpm install --frozen-lockfile

# Smoke
cd packages/pipeline
npx tsx ./src/scripts/peek-canon-body.ts a8a05629-d400-4f71-a231-99614615521c 0 | head -8
# Expected: Jordan body, ~818 words, first_person register.

cd ..
ls packages/  # confirm we can see existing packages — synthesis will be new
```

If smoke fails: stop. Reconcile before continuing.

---

## File Structure

```
packages/synthesis/                                    ← NEW package
  package.json
  tsconfig.json
  src/
    index.ts                                           ← public exports
    types.ts                                           ← ProductBundle, all component types
    runner.ts                                          ← orchestrator
    composers/
      action-plan-composer.ts                         ← Task A.2
      action-plan-composer.test.ts
      worksheet-forge.ts                              ← Task A.3
      worksheet-forge.test.ts
      calculator-forge.ts                             ← Task A.4
      calculator-forge.test.ts
      diagnostic-composer.ts                          ← Task A.5
      diagnostic-composer.test.ts
      funnel-composer.ts                              ← Task A.6
      funnel-composer.test.ts
      router.ts                                       ← archetype × goal → composer list
      router.test.ts

packages/db/src/schema/
  synthesis.ts                                        ← NEW — synthesisRun, productBundle tables
packages/db/drizzle/
  0017_phase_a_synthesis_tables.sql                   ← NEW migration
  out/_journal.json                                   ← updated (sequential after Codex's 0016)

packages/pipeline/src/scripts/
  run-synthesis.ts                                    ← NEW — CLI entry: tsx ./src/scripts/run-synthesis.ts <runId>
  peek-product-bundle.ts                              ← NEW — qualitative inspector
  inspect-synthesis-state.ts                          ← NEW — operator diagnostic

apps/web/src/app/api/runs/[runId]/synthesis/
  route.ts                                            ← NEW — GET handler
apps/web/src/app/api/runs/[runId]/synthesize/
  route.ts                                            ← NEW — POST handler

apps/web/src/components/hub/shells/operator-coach/
  index.tsx                                           ← NEW — shell entry
  pages/
    HomePage.tsx                                      ← NEW — diagnostic landing
    ActionPlanPage.tsx                                ← NEW — generator + result
    WorksheetPage.tsx                                 ← NEW — fillable worksheet
    CalculatorPage.tsx                                ← NEW — interactive calculator
    LibraryPage.tsx                                   ← NEW — canon reference (de-emphasized)
  data-adapter.ts                                     ← NEW — bundle → shell page props

docs/superpowers/plans/
  2026-MM-DD-phase-a-results.md                       ← NEW (Task A.12)
```

---

## Task A.1 — Synthesis package scaffold + ProductBundle types

**Files:**
- Create: `packages/synthesis/package.json`
- Create: `packages/synthesis/tsconfig.json`
- Create: `packages/synthesis/src/index.ts`
- Create: `packages/synthesis/src/types.ts`
- Modify: `pnpm-workspace.yaml` (register package)
- Modify: `package.json` root (add to workspaces if needed)

**Why:** Establishes the package boundary so synthesis stays isolated from pipeline. Defines the `ProductBundle` shape that all subsequent tasks emit components into.

- [ ] **Step 1: Scaffold the package**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/phase-a-execute"
mkdir -p packages/synthesis/src/composers
```

Create `packages/synthesis/package.json`:
```json
{
  "name": "@creatorcanon/synthesis",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./runner": "./src/runner.ts",
    "./composers/*": "./src/composers/*.ts"
  },
  "dependencies": {
    "@creatorcanon/core": "workspace:*",
    "@creatorcanon/db": "workspace:*",
    "@creatorcanon/pipeline": "workspace:*",
    "zod": "3.23.8"
  }
}
```

Create `packages/synthesis/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist", "composite": true },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Define ProductBundle types**

Create `packages/synthesis/src/types.ts` with the full type tree (truncated example — write it complete):

```ts
import type { ArchetypeSlug } from '@creatorcanon/pipeline/dist/agents/skills/archetype-detector';
import type { VoiceMode } from '@creatorcanon/pipeline/dist/scripts/util/voice-mode';

export type ProductGoal =
  | 'lead_magnet'
  | 'paid_product'
  | 'member_library'
  | 'sales_asset'
  | 'public_reference';

export interface CreatorConfig {
  brand: { primaryColor: string; logoUrl?: string; logoAlt?: string };
  ctas: { primary?: { label: string; href: string }; secondary?: { label: string; href: string } };
  funnelDestination?: string;
  customDomain?: string;
}

export interface ActionPlanStep {
  id: string;
  title: string;
  description: string;
  durationLabel: string;        // "this week" | "this month" | "next 90 days"
  successCriterion: string;     // "you've done this when..."
  sourceCanonId: string;
  estimatedMinutes?: number;
}

export interface ActionPlanPhase {
  id: string;
  name: string;                 // "Pre-revenue" | "Sub-$10K month" | "Sub-$100K month" | "Scale"
  position: number;
  steps: ActionPlanStep[];
}

export interface ActionPlanComponent {
  phases: ActionPlanPhase[];
  intro: string;
  outroCta: string;
}

export interface WorksheetField {
  id: string;
  type: 'text_short' | 'text_long' | 'multi_choice' | 'number' | 'list' | 'decision_branch';
  label: string;
  helpText?: string;
  options?: string[];           // for multi_choice
  branches?: Array<{ trigger: string; thenSteps: string[] }>;  // for decision_branch
}

export interface WorksheetComponent {
  id: string;
  canonId: string;
  title: string;
  setupQuestion: string;
  fields: WorksheetField[];
  outputRubric: string;
  estimatedMinutes: number;
}

export interface CalculatorVariable {
  id: string;
  label: string;
  type: 'currency' | 'integer' | 'percentage' | 'months';
  defaultValue: number;
  minValue?: number;
  maxValue?: number;
}

export interface CalculatorComponent {
  id: string;
  title: string;
  description: string;
  variables: CalculatorVariable[];
  formula: string;              // sandboxed expression — see calculator-forge.ts
  outputLabel: string;
  outputUnit: string;
  interpretation: string;       // "this number means..."
  sourceClaimCanonIds: string[];
}

export interface DiagnosticQuestion {
  id: string;
  text: string;
  options: Array<{ label: string; value: string; weight: number }>;
}

export interface DiagnosticOutcome {
  matchScore: number;
  recommendedNextStep: string;
  routeToCanonIds: string[];
  routeToActionPlanPhaseId?: string;
}

export interface DiagnosticComponent {
  questions: DiagnosticQuestion[];
  scoring: Record<string, DiagnosticOutcome>;
  intro: string;
}

export interface FunnelComponent {
  goal: ProductGoal;
  emailCapture?: { label: string; submitText: string; thankyouText: string };
  paywall?: { tagline: string; bullets: string[]; ctaText: string };
  shareCardTemplates: Array<{ id: string; title: string; quote: string; sourceCanonId: string }>;
  inlineCtas: Array<{ pageDepth: 'shallow' | 'mid' | 'deep'; text: string; href: string }>;
}

export interface ProductBundle {
  archetype: ArchetypeSlug;
  voiceMode: VoiceMode;
  productGoal: ProductGoal;
  creatorConfig: CreatorConfig;
  components: {
    actionPlan?: ActionPlanComponent;        // operator-coach
    worksheets?: WorksheetComponent[];        // operator-coach + instructional-craft
    calculators?: CalculatorComponent[];      // operator-coach
    diagnostic?: DiagnosticComponent;         // operator-coach + instructional-craft + science-explainer
    cards?: never;                            // contemplative-thinker (filled in Phase I)
    reference?: never;                        // science-explainer (filled in Phase H)
    lessonSequence?: never;                   // instructional-craft (filled in Phase J)
    funnel: FunnelComponent;
  };
  generatedAt: string;                       // ISO timestamp
  schemaVersion: 'product_bundle_v1';
}
```

- [ ] **Step 3: Public exports**

Create `packages/synthesis/src/index.ts`:
```ts
export type * from './types';
export { runSynthesis } from './runner';
export { routeComposers } from './composers/router';
```

- [ ] **Step 4: pnpm workspace registration**

Verify `pnpm-workspace.yaml` has `packages/*` glob. If yes, no change. Then:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/phase-a-execute"
pnpm install --frozen-lockfile=false
# Should resolve @creatorcanon/synthesis as workspace package.
```

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit -p packages/synthesis/tsconfig.json 2>&1 | tail -10
# Expected: no errors (this is just types + scaffold).

git add packages/synthesis/ pnpm-lock.yaml
git commit -m "feat(phase-a): synthesis package scaffold + ProductBundle types

Establishes packages/synthesis/ as the home for product synthesis
composer agents. Defines the ProductBundle type tree:
- ActionPlanComponent (phases × steps)
- WorksheetComponent (fields including decision branches)
- CalculatorComponent (variables, formula, interpretation)
- DiagnosticComponent (questions × scoring outcomes)
- FunnelComponent (lead capture, paywall, share cards, inline CTAs)

ProductBundle wraps all components + creatorConfig + archetype +
voiceMode + productGoal. Single typed artifact downstream consumers
(API + shell) read from.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A.2 — ActionPlan Composer (the headline product moment)

**Files:**
- Create: `packages/synthesis/src/composers/action-plan-composer.ts`
- Create: `packages/synthesis/src/composers/action-plan-composer.test.ts`

**Why:** This composer produces THE thing operator-coach audiences come for — a personalized 90-day action plan. It's the front-and-center product on the hub home page. Every other operator-coach component supports the action plan.

**Algorithm:**
1. Pull all canon nodes of type `playbook` and `framework` from the audit substrate.
2. Cluster by inferred phase-of-business (pre-revenue / sub-$10K / sub-$100K / scale). Use canon body keywords + voiceFingerprint to classify.
3. Within each phase, topologically order frameworks by prerequisite dependency.
4. For each step, generate (via Codex):
   - Concise step name (≤ 8 words)
   - 1-line description
   - Duration label
   - Success criterion
5. Generate intro + outro CTA in voice-mode (operator-coach is always first_person).

- [ ] **Step 1: Write failing tests**

Tests cover:
- Phase clustering produces 4 expected phases
- Topological ordering preserves dependencies
- Output ActionPlanComponent shape matches schema
- Codex call mocking works

```ts
// packages/synthesis/src/composers/action-plan-composer.test.ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { composeActionPlan, classifyCanonByPhase } from './action-plan-composer';

describe('classifyCanonByPhase', () => {
  test('classifies pre-revenue keywords correctly', () => {
    const canon = { id: 'c1', payload: { type: 'playbook', body: 'You pick a niche. You earn the right to niche down. You start scattergun.', _index_voice_fingerprint: { archetype: 'operator-coach' } } };
    assert.equal(classifyCanonByPhase(canon as any), 'pre_revenue');
  });
  test('classifies sub-$10K keywords correctly', () => {
    const canon = { id: 'c2', payload: { type: 'framework', body: 'You want a $10K month. You build the AI sales system.' } };
    assert.equal(classifyCanonByPhase(canon as any), 'sub_10k_month');
  });
  test('classifies scale keywords correctly', () => {
    const canon = { id: 'c3', payload: { type: 'framework', body: 'You delegate by design. You run 60+ locations.' } };
    assert.equal(classifyCanonByPhase(canon as any), 'scale');
  });
  test('falls back to sub_100k for ambiguous content', () => {
    const canon = { id: 'c4', payload: { type: 'lesson', body: 'Generic advice without phase markers.' } };
    assert.equal(classifyCanonByPhase(canon as any), 'sub_100k_month');
  });
});

describe('composeActionPlan (integration with mocked Codex)', () => {
  test('produces ActionPlanComponent with 4 phases', async () => {
    const canons = [/* fixture */];
    const mockCodex = async () => ({ stepName: 'X', description: 'Y', durationLabel: 'this week', successCriterion: 'Z' });
    const result = await composeActionPlan({ canons, runId: 'test', voiceMode: 'first_person' }, { codex: mockCodex });
    assert.equal(result.phases.length, 4);
    assert.ok(result.intro.length > 0);
    assert.ok(result.outroCta.length > 0);
  });
});
```

- [ ] **Step 2: Implement classifier (pure code, no Codex)**

```ts
// In action-plan-composer.ts
const PHASE_KEYWORDS: Record<string, RegExp[]> = {
  pre_revenue: [/niche.*down/i, /scattergun/i, /first.*\$0/i, /pre[- ]revenue/i, /\\$0[- ]\\$1k/i, /no customers/i, /first deal/i],
  sub_10k_month: [/\\$10[Kk] month/i, /first \\$10/i, /survival/i, /first paid/i, /MVP/i, /first system/i],
  sub_100k_month: [/\\$100[Kk]/i, /scale.*team/i, /processes/i, /repeatable/i, /first hire/i, /\\$50[Kk]/i],
  scale: [/delegate by design/i, /60\\+ locations/i, /scale operator/i, /\\$1M/i, /multiply/i, /enterprise/i],
};

export function classifyCanonByPhase(canon: { payload: { body?: string } }): keyof typeof PHASE_KEYWORDS {
  const body = canon.payload.body ?? '';
  const scores: Record<string, number> = {};
  for (const [phase, patterns] of Object.entries(PHASE_KEYWORDS)) {
    scores[phase] = patterns.filter((re) => re.test(body)).length;
  }
  const best = Object.entries(scores).reduce((a, b) => (a[1] >= b[1] ? a : b));
  return best[1] === 0 ? 'sub_100k_month' : (best[0] as keyof typeof PHASE_KEYWORDS);
}
```

- [ ] **Step 3: Implement topological dependency ordering**

Use canon shells' `_index_dependencies` field if present; else fallback to body-keyword analysis (one canon mentions the title of another → that other is a prerequisite).

```ts
function topoSort(canons: CanonRef[]): CanonRef[] {
  const idIndex = new Map(canons.map((c) => [c.id, c]));
  const titleIndex = new Map(canons.map((c) => [c.payload.title.toLowerCase(), c.id]));

  const dependencies = new Map<string, Set<string>>();  // canonId → set of prerequisite canonIds
  for (const c of canons) {
    const deps = new Set<string>();
    for (const [title, otherId] of titleIndex) {
      if (otherId === c.id) continue;
      if (c.payload.body?.toLowerCase().includes(title)) deps.add(otherId);
    }
    if (Array.isArray(c.payload._index_dependencies)) {
      for (const d of c.payload._index_dependencies) {
        if (idIndex.has(d)) deps.add(d);
      }
    }
    dependencies.set(c.id, deps);
  }

  // Kahn's algorithm
  const result: CanonRef[] = [];
  const remaining = new Map(canons.map((c) => [c.id, c]));
  while (remaining.size > 0) {
    const ready = [...remaining.values()].find((c) => {
      const deps = dependencies.get(c.id) ?? new Set();
      return [...deps].every((d) => !remaining.has(d));
    });
    if (!ready) {
      // Cycle detected — break by taking lowest-id remaining
      const fallback = [...remaining.values()].sort((a, b) => a.id.localeCompare(b.id))[0]!;
      result.push(fallback);
      remaining.delete(fallback.id);
      continue;
    }
    result.push(ready);
    remaining.delete(ready.id);
  }
  return result;
}
```

- [ ] **Step 4: Implement Codex-driven step authoring**

```ts
async function authorActionPlanStep(canon: CanonRef, codex: CodexClient, voiceMode: VoiceMode): Promise<ActionPlanStep> {
  const prompt = `You are writing one step of an operator-coach action plan. Read this canon and emit a JSON step:

Canon: ${canon.payload.title}
Body excerpt: ${canon.payload.body?.slice(0, 1500) ?? ''}

Output rules:
- "title": 4-8 words, imperative ("Map the Value Ladder")
- "description": 1 sentence, ${voiceMode === 'first_person' ? 'first-person' : 'editorial'}, what the reader does
- "durationLabel": one of "this week", "this month", "next 90 days"
- "successCriterion": 1 sentence, "you'll know it worked when..."

Format: ONE JSON object. First char {, last char }. No code fences.`;
  const raw = await codex.run(prompt, { stage: 'action_plan_step', timeoutMs: 60_000 });
  const parsed = repairTruncatedJson(raw) as ActionPlanStep | null;
  if (!parsed) throw new Error(`action-plan: failed to parse step for canon ${canon.id}`);
  return { ...parsed, id: `step_${canon.id}`, sourceCanonId: canon.id };
}
```

- [ ] **Step 5: Compose all together**

```ts
export async function composeActionPlan(input: ComposeInput, opts: { codex: CodexClient }): Promise<ActionPlanComponent> {
  const eligibleCanons = input.canons.filter((c) =>
    ['playbook', 'framework'].includes(c.payload.type ?? '')
  );

  const phases: Record<string, CanonRef[]> = { pre_revenue: [], sub_10k_month: [], sub_100k_month: [], scale: [] };
  for (const c of eligibleCanons) phases[classifyCanonByPhase(c)].push(c);

  const orderedPhases: ActionPlanPhase[] = [];
  let pos = 0;
  for (const [phaseId, canons] of Object.entries(phases)) {
    if (canons.length === 0) continue;
    const ordered = topoSort(canons);
    const steps = await Promise.all(ordered.map((c) => authorActionPlanStep(c, opts.codex, input.voiceMode)));
    orderedPhases.push({
      id: phaseId,
      name: phaseId.replace(/_/g, ' '),
      position: pos++,
      steps,
    });
  }

  // Intro + outro
  const intro = await authorIntroOutro(input, opts.codex, 'intro');
  const outroCta = await authorIntroOutro(input, opts.codex, 'outro');

  return { phases: orderedPhases, intro, outroCta };
}
```

- [ ] **Step 6: Run tests, expect all pass**

- [ ] **Step 7: Commit**

```bash
git add packages/synthesis/src/composers/action-plan-composer.ts \
        packages/synthesis/src/composers/action-plan-composer.test.ts
git commit -m "feat(phase-a): ActionPlan composer (the headline operator-coach product moment)

Composer that converts canon nodes (playbook/framework type) into a
4-phase action plan: pre_revenue, sub_10k_month, sub_100k_month, scale.

Three-stage pipeline:
- Phase classification: keyword-based regex match against business-stage
  signals in canon body
- Topological ordering: Kahn's algorithm using canon._index_dependencies
  + body-mention-of-other-canon-titles as edges
- Per-step authoring: 1 Codex call per canon to produce step name,
  description, duration label, success criterion (voice-mode-aware)

Plus intro + outro CTA (2 more Codex calls). Total: ~25-50 calls per
operator-coach creator (vs ~200-500 for full audit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task A.3 — Worksheet Forge

**Files:**
- Create: `packages/synthesis/src/composers/worksheet-forge.ts`
- Create: `packages/synthesis/src/composers/worksheet-forge.test.ts`

**Why:** Each operator-coach framework should become a fillable worksheet — turn teaching into doing. The audience walks away with a completed plan, not just notes.

**Algorithm:**
1. For each canon node of type `framework`, `playbook`, `pattern`, decompose body into:
   - Setup question (anchor)
   - Step-by-step prompts (one per body section)
   - Decision branches (if-this-then-that)
   - Output rubric
2. Codex authors each section conditionally on canon body shape.
3. Output a WorksheetComponent per canon.

- [ ] **Step 1: Write failing tests** (cover: setup question generation, step decomposition, decision branch detection)

- [ ] **Step 2: Implement section-decomposer (pure code first)**

Detect body sub-headings (`## X`) as natural worksheet steps. Detect imperative bullets ("- You stop chasing every platform") as steps within a section. Detect "if X, do Y" patterns as decision branches.

- [ ] **Step 3: Implement Codex-driven setup question + output rubric authoring**

One Codex call per canon. Prompt asks for:
```json
{
  "setupQuestion": "Before you map your value ladder, write down: ...",
  "outputRubric": "You'll know your value ladder works when ...",
  "estimatedMinutes": <integer>
}
```

- [ ] **Step 4: Compose WorksheetComponent**

- [ ] **Step 5: Run tests + commit**

Commit message: `feat(phase-a): Worksheet Forge composer (framework → fillable worksheet)`.

---

## Task A.4 — Calculator Forge

**Files:**
- Create: `packages/synthesis/src/composers/calculator-forge.ts`
- Create: `packages/synthesis/src/composers/calculator-forge.test.ts`

**Why:** Operator-coach creators (especially Hormozi) make ~12 quantified claims per video. Turning the most interesting 5-7 into interactive calculators gives the audience a tool, not just a number.

**Algorithm:**
1. Extract quantified claims from canon bodies (regex: `\$[\d,]+|[\d.]+%|[\d]+x ROI|\\d+ months payback|\\d+ leads`).
2. Cluster by topic (LTV/CAC, monthly revenue, lifetime value, conversion rate).
3. For each cluster of 3+ related claims, infer a calculator schema (variables + formula).
4. Codex authors interpretation + variable labels.

- [ ] **Step 1: Failing tests** (cover: claim extraction regex, clustering, formula inference)

- [ ] **Step 2: Claim extractor**

```ts
const QUANTIFIED_PATTERNS: RegExp[] = [
  /\\$([0-9][0-9,]*)\\b/g,         // dollar amounts
  /([0-9.]+)%/g,                   // percentages
  /([0-9]+)x ROI/gi,
  /([0-9]+) months payback/gi,
  /([0-9]+):1 LTV(?:\\/| to )CAC/gi,
];
```

- [ ] **Step 3: Topic clustering** (k-means by claim context window — 50 chars before/after)

- [ ] **Step 4: Formula inference**

For each cluster, ask Codex: "Given these claims, what calculator would teach the underlying math?" Output a sandboxed expression (e.g., `monthlyRevenue * lifetimeMonths` for LTV).

Use a tiny safe-eval (no `Function()` — use a small expression parser like `mathjs`).

- [ ] **Step 5: Compose CalculatorComponent + commit**

Commit: `feat(phase-a): Calculator Forge (quantified-claim → interactive calculator)`.

---

## Task A.5 — Diagnostic Composer

**Files:**
- Create: `packages/synthesis/src/composers/diagnostic-composer.ts`
- Create: `packages/synthesis/src/composers/diagnostic-composer.test.ts`

**Why:** The operator-coach hub's front door. Reader answers 3-15 questions, gets routed to "your next move" — the right action plan phase + canon links.

**Algorithm:**
1. Read audience JTBD signals from `_index_audience_jobs` on the channel profile.
2. Cluster by job (acquire customers / improve retention / hire / scale / etc.).
3. Author 10-15 multiple-choice questions whose answers reveal the reader's job.
4. Map each answer combination to a `DiagnosticOutcome` (recommended canon IDs + action plan phase).

- [ ] **Step 1: Failing tests** (cover: question generation, scoring rubric construction)

- [ ] **Step 2: Audience-job extractor** (read `_index_audience_jobs` from channel profile)

- [ ] **Step 3: Codex question authoring** (single Codex call: "Author 10-15 multi-choice questions that diagnose where this reader is stuck")

- [ ] **Step 4: Scoring rubric** (deterministic — answer combinations → routes; uses canon `_index_audience_job_tags`)

- [ ] **Step 5: Compose DiagnosticComponent + commit**

Commit: `feat(phase-a): Diagnostic composer (front-door routing for operator-coach hub)`.

---

## Task A.6 — Funnel Composer

**Files:**
- Create: `packages/synthesis/src/composers/funnel-composer.ts`
- Create: `packages/synthesis/src/composers/funnel-composer.test.ts`

**Why:** Distribution-mode-aware copy. Lead-magnet hub gets email-capture overlay; paid hub gets paywall; member hub gets login. Plus inline CTAs at the right reading depth.

**Algorithm:**
1. Read `productGoal` from `CreatorConfig`.
2. Author goal-specific copy (3 Codex calls: lead-capture text, paywall text, share-card templates).
3. Generate inline CTAs at 3 depths (shallow / mid / deep) — calibrated to where the reader is most likely to act.

- [ ] **Step 1: Failing tests**

- [ ] **Step 2: Goal-conditional copy generator**

For lead_magnet:
- Email capture: hook + value prop + form
- Inline CTAs: "Get the free [X] checklist" / "Join the email list"
- Share cards: top 3 aphorisms as quote cards

For paid_product:
- Paywall: headline + bullets + CTA
- Inline CTAs: "Unlock the full [X]"
- Share cards: same

For member_library:
- Login: "Members only — sign in"
- Inline CTAs: links to Discord/Circle threads
- Share cards: optional

- [ ] **Step 3: Compose FunnelComponent + commit**

Commit: `feat(phase-a): Funnel composer (distribution-aware copy generator)`.

---

## Task A.7 — Composer Router + Synthesis Runner

**Files:**
- Create: `packages/synthesis/src/composers/router.ts`
- Create: `packages/synthesis/src/composers/router.test.ts`
- Create: `packages/synthesis/src/runner.ts`
- Create: `packages/synthesis/src/runner.test.ts`

**Why:** Orchestration layer. Picks which composers run for a given (archetype, productGoal) pair + runs them in parallel where safe.

- [ ] **Step 1: Router logic**

```ts
const COMPOSER_MATRIX: Record<ArchetypeSlug, Set<keyof ProductBundle['components']>> = {
  'operator-coach': new Set(['actionPlan', 'worksheets', 'calculators', 'diagnostic', 'funnel']),
  'science-explainer': new Set(['reference', 'diagnostic', 'funnel']),
  'contemplative-thinker': new Set(['cards', 'funnel']),
  'instructional-craft': new Set(['lessonSequence', 'worksheets', 'diagnostic', 'funnel']),
};

export function routeComposers(archetype: ArchetypeSlug): Set<keyof ProductBundle['components']> {
  return COMPOSER_MATRIX[archetype] ?? new Set(['funnel']);
}
```

- [ ] **Step 2: Runner**

```ts
export async function runSynthesis(input: { runId: string; productGoal: ProductGoal; creatorConfig: CreatorConfig; codex: CodexClient }): Promise<ProductBundle> {
  await ensureDbHealthy();
  const audit = await loadAuditSubstrate(input.runId);
  const composers = routeComposers(audit.archetype);

  // Run independent composers in parallel; serialize only where there's real dependency
  const results = await Promise.all([
    composers.has('actionPlan') ? composeActionPlan(/*...*/) : Promise.resolve(undefined),
    composers.has('worksheets') ? composeWorksheets(/*...*/) : Promise.resolve(undefined),
    composers.has('calculators') ? composeCalculators(/*...*/) : Promise.resolve(undefined),
    composers.has('diagnostic') ? composeDiagnostic(/*...*/) : Promise.resolve(undefined),
  ]);
  const funnel = await composeFunnel(/*...*/);

  return {
    archetype: audit.archetype,
    voiceMode: audit.voiceMode,
    productGoal: input.productGoal,
    creatorConfig: input.creatorConfig,
    components: {
      actionPlan: results[0],
      worksheets: results[1],
      calculators: results[2],
      diagnostic: results[3],
      funnel,
    },
    generatedAt: new Date().toISOString(),
    schemaVersion: 'product_bundle_v1',
  };
}
```

- [ ] **Step 3: Tests + commit**

---

## Task A.8 — DB schema: synthesisRun + productBundle tables

**Files:**
- Create: `packages/db/src/schema/synthesis.ts`
- Create: `packages/db/drizzle/0017_phase_a_synthesis_tables.sql`
- Modify: `packages/db/drizzle/out/_journal.json`
- Modify: `packages/db/src/schema/index.ts` (add export)

**Why:** Persist synthesis runs (audit trail + status) + the resulting product bundle (renderer reads this).

- [ ] **Step 1: Schema definition**

```ts
// packages/db/src/schema/synthesis.ts
import { pgTable, uuid, timestamp, text, jsonb, varchar, integer } from 'drizzle-orm/pg-core';
import { generationRun } from './canon';

export const synthesisRun = pgTable('synthesis_run', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  productGoal: varchar('product_goal', { length: 32 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),  // pending | running | succeeded | failed
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  costCents: integer('cost_cents'),
});

export const productBundle = pgTable('product_bundle', {
  id: uuid('id').primaryKey().defaultRandom(),
  synthesisRunId: uuid('synthesis_run_id').notNull().references(() => synthesisRun.id, { onDelete: 'cascade' }).unique(),
  payload: jsonb('payload').notNull(),
  schemaVersion: varchar('schema_version', { length: 32 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 2: Migration SQL**

Use drizzle-kit:
```bash
cd packages/db
pnpm drizzle-kit generate
# Review the generated 0017 SQL
```

Verify _journal.json has the new entry as 0017 (after Codex's 0016).

- [ ] **Step 3: Add export + commit**

```ts
// packages/db/src/schema/index.ts
export * from './synthesis';
```

Commit: `feat(phase-a): synthesis_run + product_bundle DB schema (migration 0017)`.

---

## Task A.9 — Synthesis API endpoints (POST /synthesize, GET /synthesis)

**Files:**
- Create: `apps/web/src/app/api/runs/[runId]/synthesize/route.ts`
- Create: `apps/web/src/app/api/runs/[runId]/synthesis/route.ts`

**Why:** Web app + CLI both consume synthesis through HTTP. Onboarding wizard (Phase D) calls POST after audit completes; renderer (Phase A.11) calls GET to load the bundle.

- [ ] **Step 1: POST handler**

```ts
// route.ts
import { NextRequest, NextResponse } from 'next/server';
import { runSynthesis } from '@creatorcanon/synthesis';
import { z } from 'zod';

const BodySchema = z.object({
  productGoal: z.enum(['lead_magnet', 'paid_product', 'member_library', 'sales_asset', 'public_reference']),
  creatorConfig: z.object({
    brand: z.object({ primaryColor: z.string(), logoUrl: z.string().optional() }),
    ctas: z.object({ primary: z.object({ label: z.string(), href: z.string() }).optional() }).optional(),
  }),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const body = BodySchema.parse(await req.json());
  // Insert synthesisRun row with status=pending, then enqueue
  // Return synthesisRunId + status
  // ...
  return NextResponse.json({ synthesisRunId: '...', status: 'pending' });
}
```

- [ ] **Step 2: GET handler**

Returns the latest `productBundle` for the run, or 404 if synthesis hasn't completed.

- [ ] **Step 3: Tests + commit**

Commit: `feat(phase-a): synthesis API endpoints (POST /synthesize, GET /synthesis)`.

---

## Task A.10 — CLI runner + cohort smoke

**Files:**
- Create: `packages/pipeline/src/scripts/run-synthesis.ts`
- Create: `packages/pipeline/src/scripts/peek-product-bundle.ts`
- Create: `packages/pipeline/src/scripts/inspect-synthesis-state.ts`

**Why:** Operator-driven synthesis runs + qualitative inspection.

- [ ] **Step 1: run-synthesis.ts**

```bash
PIPELINE_OPENAI_PROVIDER=codex_cli npx tsx ./src/scripts/run-synthesis.ts <runId> --goal lead_magnet
```

Imports `runSynthesis` from `@creatorcanon/synthesis`, persists to `synthesis_run` + `product_bundle`.

- [ ] **Step 2: peek-product-bundle.ts**

Pretty-prints the bundle for human review. Used during cohort smoke.

- [ ] **Step 3: Run synthesis on the 4 operator-coach cohort creators**

```bash
for runId in a8a05629-d400-4f71-a231-99614615521c \
             037458ae-1439-4e56-a8da-aa967f2f5e1b \
             a9c221d4-a482-4bc3-8e63-3aca0af05a5b \
             10c7b35f-7f57-43ed-ae70-fac3e5cd4581; do
  echo "=== synth $runId ==="
  PIPELINE_OPENAI_PROVIDER=codex_cli npx tsx ./src/scripts/run-synthesis.ts $runId --goal lead_magnet
done

# Inspect
for runId in <same list>; do
  npx tsx ./src/scripts/peek-product-bundle.ts $runId | head -50
done
```

Expected (per creator):
- ActionPlan with 4 phases × 3-7 steps each
- 5-15 worksheets
- 3-7 calculators
- Diagnostic with 10-15 questions
- Funnel with goal=lead_magnet copy

- [ ] **Step 4: Commit**

---

## Task A.11 — Operator-coach shell + data adapter

**Files:**
- Create: `apps/web/src/components/hub/shells/operator-coach/` (multiple files)

**Why:** Renderer for the product bundle. The first archetype shell — proves the pattern that subsequent shells (H, I, J) will follow.

- [ ] **Step 1: data-adapter.ts** — converts ProductBundle → shell-specific page props

- [ ] **Step 2: HomePage.tsx** — diagnostic landing + "Start your action plan" hero

- [ ] **Step 3: ActionPlanPage.tsx** — phases × steps with progress markers

- [ ] **Step 4: WorksheetPage.tsx** — fillable form with localStorage save

- [ ] **Step 5: CalculatorPage.tsx** — input fields + sandboxed formula eval + interpretation

- [ ] **Step 6: LibraryPage.tsx** — canon reference (de-emphasized — small link in nav)

- [ ] **Step 7: Routes wired in apps/web/src/app/h/[hubSlug]/...** — operator-coach shell mounted when channelProfile.archetype === 'operator-coach'

- [ ] **Step 8: Smoke test on Hormozi's deployed hub** — visit local dev server, verify all pages render

- [ ] **Step 9: Commit + visual diff snapshot for review**

---

## Task A.12 — Phase A results doc + PR

- [ ] **Step 1: Re-run smoke on all 4 operator-coach creators** + capture metrics (composer-call counts, costs, output sizes)

- [ ] **Step 2: Write `docs/superpowers/plans/2026-MM-DD-phase-a-results.md`**

Sections:
- What shipped (8 composers + runner + API + shell)
- Composer-call cost per creator (target: < 200 Codex calls)
- Qualitative output samples (3 action plan phases shown)
- Phase B follow-ups (editor surfaces — what state needs editing UI?)
- Cohort coverage (4/4 operator-coach creators have product bundles)

- [ ] **Step 3: Open PR**

```bash
git push -u origin feat/phase-a-operator-coach-synthesis
gh pr create --draft --title "Phase A: Operator-coach product synthesis layer (8 composers + runner + shell)" --body-file <body>
```

PR body: list all 12 task commits, reference the meta-plan, document the shell architecture pattern for H/I/J.

---

## Self-Review

1. **Spec coverage:** All 8 composers from the deep dive are tasks (A.2-A.6 + funnel + router + runner). Shell adapter is A.11. Schema + API + smoke covered. ✓
2. **Placeholder scan:** No "TBD" / "TODO" / "implement later" except per-task pseudocode that the agent fills in. ✓
3. **Type consistency:** ProductBundle defined in A.1 used throughout. Composer signatures consistent (input: substrate + codex client; output: typed component). ✓
4. **Cohort verification:** Task A.10 + A.11 verify on real audit data. Not just unit tests. ✓
5. **Cost budget:** Per-creator budget ~150-250 Codex calls. Audit was ~200-500. Total per-creator audit + synthesis ~500-750 calls. Within Codex CLI free tier on the user's ChatGPT plan. ✓

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-02-phase-a-operator-coach-product-synthesis.md`.

Execute via `superpowers:subagent-driven-development`. Fresh subagent per task; two-stage review per task (spec compliance → code quality).
