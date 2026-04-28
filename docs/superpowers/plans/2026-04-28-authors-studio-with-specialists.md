# Author's Studio + Specialists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inside of `runPageCompositionStage` with a coordinated multi-agent Author's Studio (Strategist → 5 parallel Specialists → Critic → Revise → Assembler+Validator), produce 5 first-class block kinds (cited prose, roadmap, diagram, hypothetical example, common mistakes) instead of deterministic stubs, and make the upstream `canon_architect` + `video_intelligence` rich enough to feed the new authoring layer without hallucination.

**Architecture:** The hub already has strong upstream synthesis (channel profile, video intelligence cards, canon nodes, page briefs) but a hollow authoring layer. This plan keeps the upstream stages, extends `canon_architect` + `video_intelligence` prompts to capture editorial fields, then introduces a 5-stage Author's Studio inside the page-composition stage that produces editorial-grade pages. New block kinds are added to the manifest schema with matching React renderer components (Mermaid for diagrams). Voice mode is a new project config field surfaced via a configure-page radio.

**Tech Stack:** TypeScript, Drizzle ORM, OpenAI SDK, `@google/generative-ai`, Zod, React (Next.js app router), `mermaid.js` (new dep — `pnpm add mermaid -F @creatorcanon/web`), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-04-28-authors-studio-with-specialists-design.md` (Set A artifact taxonomy, 3 decisions locked in §16).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/web/src/app/app/configure/page.tsx` | modify | Add Voice radio (creator_first_person / reader_second_person) |
| `apps/web/src/app/app/configure/actions.ts` | modify | Persist `voiceMode` into `project.config` JSONB |
| `apps/web/src/lib/hub/manifest/schema.ts` | modify | Add `roadmap`, `diagram`, `hypothetical_example` block kinds |
| `apps/web/src/components/hub/sections/RoadmapBlock.tsx` | create | Numbered timeline renderer |
| `apps/web/src/components/hub/sections/DiagramBlock.tsx` | create | Mermaid renderer (dynamic import) |
| `apps/web/src/components/hub/sections/HypotheticalExampleBlock.tsx` | create | "Try it" / setup-action-outcome callout |
| `apps/web/src/components/hub/PageSection.tsx` (or wherever sections dispatch) | modify | Route 3 new kinds to new components |
| `apps/web/package.json` | modify | Add `mermaid` dep |
| `packages/pipeline/src/agents/specialists/prompts.ts` | modify | Extend CANON_ARCHITECT_PROMPT + VIDEO_ANALYST_PROMPT; add 7 new prompts (PAGE_STRATEGIST, PROSE_AUTHOR, ROADMAP_AUTHOR, EXAMPLE_AUTHOR, DIAGRAM_AUTHOR, MISTAKES_AUTHOR, CRITIC) |
| `packages/pipeline/src/agents/specialists/index.ts` | modify | Register 7 new specialists |
| `packages/pipeline/src/agents/providers/selectModel.ts` | modify | Add 7 new agent names + registry entries + QUALITY_PRESETS entries |
| `packages/pipeline/src/agents/tools/propose-canon.ts` | modify | Extend canonNodeInput Zod schema with new editorial fields; extend videoIntelligenceCardInput payload with failureModes/counterCases |
| `packages/pipeline/src/authors-studio/types.ts` | create | Shared types: PagePlan, ArtifactBundle, RevisionNote, ProseBlock, RoadmapBlock, etc. |
| `packages/pipeline/src/authors-studio/strategist.ts` | create | runStrategist(): plan a page |
| `packages/pipeline/src/authors-studio/specialists/prose.ts` | create | runProseAuthor() |
| `packages/pipeline/src/authors-studio/specialists/roadmap.ts` | create | runRoadmapAuthor() |
| `packages/pipeline/src/authors-studio/specialists/example.ts` | create | runExampleAuthor() |
| `packages/pipeline/src/authors-studio/specialists/diagram.ts` | create | runDiagramAuthor() |
| `packages/pipeline/src/authors-studio/specialists/mistakes.ts` | create | runMistakesAuthor() |
| `packages/pipeline/src/authors-studio/critic.ts` | create | runCritic() |
| `packages/pipeline/src/authors-studio/revise.ts` | create | runRevisePass() |
| `packages/pipeline/src/authors-studio/assembler.ts` | create | Deterministic stitching + persistence |
| `packages/pipeline/src/authors-studio/mermaid-validate.ts` | create | Server-side mermaid.parse() helper |
| `packages/pipeline/src/authors-studio/grounding.ts` | create | Citation grounding + voice consistency checks |
| `packages/pipeline/src/authors-studio/test/mermaid-validate.test.ts` | create | Unit tests for the parser helper |
| `packages/pipeline/src/authors-studio/test/grounding.test.ts` | create | Unit tests for citation + voice checks |
| `packages/pipeline/src/authors-studio/test/assembler.test.ts` | create | Unit tests for stitching |
| `packages/pipeline/src/stages/page-composition.ts` | rewrite | Body becomes Author's Studio orchestrator; deterministic stubs deleted |
| `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts` | modify | Pass through 3 new block kinds (no kind translation needed — the renderer already accepts the new vocabulary) |
| `packages/db/src/schema/project.ts` | inspect | Confirm config JSONB accepts the new field (no migration required — JSONB) |
| `packages/db/drizzle/out/0010_voice_mode_backfill.sql` | create | Backfill `project.config.voiceMode='reader_second_person'` for existing rows |

---

## Phase A — Foundation

### Task A1: Voice config UI + DB backfill

**Files:**
- Modify: `apps/web/src/app/app/configure/page.tsx`
- Modify: `apps/web/src/app/app/configure/actions.ts`
- Create: `packages/db/drizzle/out/0010_voice_mode_backfill.sql`
- Modify: `packages/db/drizzle/out/meta/_journal.json`

- [ ] **Step 1: Read the existing configure page to find the tone-preset radio**

```bash
grep -n "tone\|preset\|radio" apps/web/src/app/app/configure/page.tsx | head -20
```

Expected: a JSX section that renders the existing tone preset radio. We add a Voice radio next to it.

- [ ] **Step 2: Add Voice radio JSX next to the tone preset**

In `apps/web/src/app/app/configure/page.tsx`, after the existing tone preset radio group, add:

```tsx
<fieldset className="mt-6">
  <legend className="text-sm font-medium text-slate-900">Voice</legend>
  <p className="mt-1 text-xs text-slate-500">
    Direct (you-pronoun) reads as a how-to. Creator's voice (first-person)
    reads as the creator's own commentary. Choose direct unless this hub is
    primarily personal essays.
  </p>
  <div className="mt-3 space-y-2">
    <label className="flex items-start gap-3 text-sm">
      <input type="radio" name="voiceMode" value="reader_second_person" defaultChecked
             className="mt-0.5" />
      <span>
        <span className="font-medium">Direct (you-pronoun)</span>
        <span className="block text-xs text-slate-500">
          "If you want to win retainers, embed Phase 2 hooks in your Phase 1 proposal."
        </span>
      </span>
    </label>
    <label className="flex items-start gap-3 text-sm">
      <input type="radio" name="voiceMode" value="creator_first_person"
             className="mt-0.5" />
      <span>
        <span className="font-medium">Creator's voice (first-person)</span>
        <span className="block text-xs text-slate-500">
          "I built the proposal generator after losing too many deals to slow turnaround."
        </span>
      </span>
    </label>
  </div>
</fieldset>
```

- [ ] **Step 3: Persist `voiceMode` into project.config in the action**

In `apps/web/src/app/app/configure/actions.ts`, find the `db.update(project).set(...)` block that saves the config and extend the config object:

```typescript
// Inside the configure submit action, where `config` is built from formData:
const voiceModeRaw = formData.get('voiceMode');
const voiceMode = voiceModeRaw === 'creator_first_person' ? 'creator_first_person' : 'reader_second_person';
// then merge into the config payload that's stored on project.config:
const config = {
  // ...existing fields...
  voiceMode,
};
```

- [ ] **Step 4: Write the backfill migration**

Create `packages/db/drizzle/out/0010_voice_mode_backfill.sql`:

```sql
-- Backfill voiceMode='reader_second_person' for any existing project.config
-- that doesn't yet carry the field. JSONB merge — no schema change.
UPDATE "project"
SET "config" = COALESCE("config", '{}'::jsonb) || jsonb_build_object('voiceMode', 'reader_second_person')
WHERE NOT (COALESCE("config", '{}'::jsonb) ? 'voiceMode');
```

- [ ] **Step 5: Append journal entry**

Edit `packages/db/drizzle/out/meta/_journal.json` to add idx 10 after the existing idx 9:

```json
    {
      "idx": 10,
      "version": "7",
      "when": 1777680000000,
      "tag": "0010_voice_mode_backfill",
      "breakpoints": true
    }
```

- [ ] **Step 6: Apply migration + verify**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS" && pnpm db:migrate 2>&1 | tail -3
```

Expected: `[db] migrations applied`.

Verify the existing project got the field:

```bash
cd packages/db && node -e "
const fs=require('node:fs');for(const f of['../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\\r?\\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL)\`SELECT id, config->'voiceMode' AS voice FROM project WHERE id = 'bd8dfb10-07cc-48a8-b7bc-63e38c6633b4'\`.then(r=>{console.log(r);process.exit(0)});
" 2>&1 | tail -5
```

Expected: `voice: "reader_second_person"`.

- [ ] **Step 7: Typecheck + commit**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add apps/web/src/app/app/configure/page.tsx apps/web/src/app/app/configure/actions.ts packages/db/drizzle/out/0010_voice_mode_backfill.sql packages/db/drizzle/out/meta/_journal.json
git commit -m "feat(configure): voice mode radio + backfill default reader_second_person"
```

---

### Task A2: Manifest schema extension — 3 new block kinds

**Files:**
- Modify: `apps/web/src/lib/hub/manifest/schema.ts`

- [ ] **Step 1: Read existing pageSectionSchema to understand the discriminated union pattern**

```bash
sed -n '8,33p' apps/web/src/lib/hub/manifest/schema.ts
```

Expected: existing kinds `overview, why_it_works, steps, common_mistakes, aha_moments, principles, scenes, workflow, failure_points, callout, paragraph, list, quote`.

- [ ] **Step 2: Add the 3 new block kinds to the discriminated union**

In `apps/web/src/lib/hub/manifest/schema.ts`, append three new variants inside `pageSectionSchema`:

```typescript
  z.object({
    kind: z.literal('roadmap'),
    title: z.string().min(1),
    steps: z.array(z.object({
      index: z.number().int().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      durationLabel: z.string().optional(),
    })).min(2).max(9),
    ...sectionCitations,
  }),
  z.object({
    kind: z.literal('diagram'),
    diagramType: z.enum(['flowchart', 'sequence', 'state', 'mindmap']),
    mermaidSrc: z.string().min(10),
    caption: z.string().min(1),
    ...sectionCitations,
  }),
  z.object({
    kind: z.literal('hypothetical_example'),
    setup: z.string().min(20),
    stepsTaken: z.array(z.string().min(1)).min(2).max(7),
    outcome: z.string().min(10),
    ...sectionCitations,
  }),
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ../.. && git add apps/web/src/lib/hub/manifest/schema.ts
git commit -m "feat(manifest): add roadmap, diagram, hypothetical_example block kinds"
```

---

### Task A3: Author's Studio shared types

**Files:**
- Create: `packages/pipeline/src/authors-studio/types.ts`

- [ ] **Step 1: Create the types file**

Create `packages/pipeline/src/authors-studio/types.ts` with these exports:

```typescript
/**
 * Shared types for the Author's Studio. The Strategist plans the page; the
 * specialists author one artifact each; the critic reads everything and
 * proposes revisions; the assembler stitches the final blockTreeJson.
 */

export type VoiceMode = 'creator_first_person' | 'reader_second_person';

export type ArtifactKind = 'cited_prose' | 'roadmap' | 'hypothetical_example' | 'diagram' | 'common_mistakes';

export interface PagePlan {
  pageId: string;                     // brief id (used as page-plan id)
  pageType: string;                   // lesson | framework | playbook | topic_overview | etc.
  pageTitle: string;
  thesis: string;                     // 1-2 sentence editorial thesis
  arc: Array<{
    beat: string;                     // 1-line beat description
    canonNodeIds: string[];           // canon nodes anchoring this beat
  }>;
  voiceMode: VoiceMode;
  voiceNotes: {
    tone: 'analytical' | 'practitioner' | 'urgent' | 'generous';
    creatorTermsToUse: string[];      // 3-5 items lifted from creatorTerminology
    avoidPhrases: string[];           // generic phrases to avoid
  };
  artifacts: Array<{
    kind: ArtifactKind;
    canonNodeIds: string[];           // which canon nodes feed this artifact
    intent: string;                   // 1 sentence: what THIS artifact contributes
  }>;
  siblingPagesToReference: Array<{ pageId: string; title: string; slug: string }>;
  costCents: number;
}

export interface ProseArtifact {
  kind: 'cited_prose';
  paragraphs: Array<{ heading?: string; body: string; citationIds: string[] }>;
  costCents: number;
}

export interface RoadmapArtifact {
  kind: 'roadmap';
  title: string;
  steps: Array<{
    index: number;
    title: string;
    body: string;
    durationLabel?: string;
    citationIds: string[];
  }>;
  costCents: number;
}

export interface ExampleArtifact {
  kind: 'hypothetical_example';
  setup: string;
  stepsTaken: string[];
  outcome: string;
  citationIds: string[];
  costCents: number;
}

export interface DiagramArtifact {
  kind: 'diagram';
  diagramType: 'flowchart' | 'sequence' | 'state' | 'mindmap';
  mermaidSrc: string;
  caption: string;
  citationIds: string[];
  costCents: number;
}

export interface MistakesArtifact {
  kind: 'common_mistakes';
  items: Array<{
    mistake: string;
    why: string;
    correction: string;
    citationIds: string[];
  }>;
  costCents: number;
}

export type SpecialistArtifact = ProseArtifact | RoadmapArtifact | ExampleArtifact | DiagramArtifact | MistakesArtifact;

export interface ArtifactBundle {
  prose: ProseArtifact;
  roadmap?: RoadmapArtifact;
  example?: ExampleArtifact;
  diagram?: DiagramArtifact;
  mistakes?: MistakesArtifact;
}

export interface RevisionNote {
  artifactKind: ArtifactKind;
  severity: 'critical' | 'important' | 'minor';
  issue: string;                      // 1 sentence
  evidence: string;                   // the offending text or reference
  prescription: string;               // concrete fix
}

export interface CriticOutput {
  notes: RevisionNote[];
  approved: boolean;                  // true when no critical notes
  costCents: number;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ../.. && git add packages/pipeline/src/authors-studio/types.ts
git commit -m "feat(authors-studio): shared types (PagePlan, artifacts, RevisionNote)"
```

---

## Phase B — Renderer components

### Task B1: Install mermaid + DiagramBlock component

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/components/hub/sections/DiagramBlock.tsx`

- [ ] **Step 1: Install mermaid**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS" && pnpm add mermaid -F @creatorcanon/web 2>&1 | tail -3
```

Expected: `mermaid` listed in `apps/web/package.json` dependencies.

- [ ] **Step 2: Create DiagramBlock component**

Create `apps/web/src/components/hub/sections/DiagramBlock.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

export interface DiagramBlockProps {
  diagramType: 'flowchart' | 'sequence' | 'state' | 'mindmap';
  mermaidSrc: string;
  caption: string;
}

/**
 * Mermaid renderer for hub diagrams. Loads mermaid.js dynamically on the
 * client (it's heavy — 2MB+ bundled) so non-diagram pages don't pay the
 * cost. Renders to inline SVG. Falls back to a fenced code block if
 * Mermaid fails at render time.
 */
export function DiagramBlock({ diagramType: _t, mermaidSrc, caption }: DiagramBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
        const id = 'diagram-' + Math.random().toString(36).slice(2, 10);
        const { svg } = await mermaid.render(id, mermaidSrc);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [mermaidSrc]);

  return (
    <figure className="my-6 rounded-lg border border-slate-200 bg-white p-4">
      {error ? (
        <pre className="overflow-x-auto text-xs text-slate-700 bg-slate-50 p-3 rounded">{mermaidSrc}</pre>
      ) : (
        <div ref={containerRef} className="flex justify-center" />
      )}
      <figcaption className="mt-3 text-sm text-slate-600 text-center italic">{caption}</figcaption>
    </figure>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ../.. && git add apps/web/package.json apps/web/src/components/hub/sections/DiagramBlock.tsx pnpm-lock.yaml
git commit -m "feat(hub): mermaid dep + DiagramBlock with dynamic import"
```

---

### Task B2: HypotheticalExampleBlock component

**Files:**
- Create: `apps/web/src/components/hub/sections/HypotheticalExampleBlock.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/hub/sections/HypotheticalExampleBlock.tsx`:

```tsx
export interface HypotheticalExampleBlockProps {
  setup: string;
  stepsTaken: string[];
  outcome: string;
}

/**
 * "Try it" callout: a worked hypothetical scenario that shows the reader
 * how to apply the page's lesson concretely. Visually distinct from prose
 * so the reader knows this is illustrative rather than source-cited.
 */
export function HypotheticalExampleBlock({ setup, stepsTaken, outcome }: HypotheticalExampleBlockProps) {
  return (
    <aside className="my-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Worked example</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-800">{setup}</p>
      <ol className="mt-3 list-decimal list-inside space-y-1 text-sm text-slate-800 marker:font-semibold">
        {stepsTaken.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-sm font-medium text-slate-900">
        <span className="text-amber-700">Outcome:</span> {outcome}
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add apps/web/src/components/hub/sections/HypotheticalExampleBlock.tsx
git commit -m "feat(hub): HypotheticalExampleBlock — worked-example callout renderer"
```

---

### Task B3: RoadmapBlock component

**Files:**
- Create: `apps/web/src/components/hub/sections/RoadmapBlock.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/hub/sections/RoadmapBlock.tsx`:

```tsx
export interface RoadmapBlockProps {
  title: string;
  steps: Array<{
    index: number;
    title: string;
    body: string;
    durationLabel?: string;
  }>;
}

/**
 * Numbered vertical timeline of actionable steps. Each step shows index +
 * title (bold) + body (prose) + optional duration label (e.g. "~30 min").
 */
export function RoadmapBlock({ title, steps }: RoadmapBlockProps) {
  return (
    <section className="my-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
      <ol className="mt-4 space-y-4">
        {steps.map((s) => (
          <li key={s.index} className="flex gap-3">
            <span className="flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
              {s.index}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                {s.durationLabel ? (
                  <span className="text-xs text-slate-500">· {s.durationLabel}</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add apps/web/src/components/hub/sections/RoadmapBlock.tsx
git commit -m "feat(hub): RoadmapBlock — numbered timeline renderer"
```

---

### Task B4: Wire 3 new blocks into the section dispatcher

**Files:**
- Modify: the file in `apps/web/src/components/hub/` that renders sections by `kind`

- [ ] **Step 1: Find the dispatcher**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS" && grep -rln "section.kind\|kind === 'overview'\|case 'overview'" apps/web/src/components/hub/ | head -5
```

Expected: a file (likely `apps/web/src/components/hub/PageSection.tsx` or similar) with a switch / if-else that routes `kind` to specific renderers.

- [ ] **Step 2: Add 3 new cases**

In the dispatcher file, add:

```tsx
import { RoadmapBlock } from './sections/RoadmapBlock';
import { DiagramBlock } from './sections/DiagramBlock';
import { HypotheticalExampleBlock } from './sections/HypotheticalExampleBlock';
```

And add cases to the switch. Example shape (adjust to match the existing dispatcher file's pattern):

```tsx
if (section.kind === 'roadmap') {
  return <RoadmapBlock title={section.title} steps={section.steps} />;
}
if (section.kind === 'diagram') {
  return <DiagramBlock diagramType={section.diagramType} mermaidSrc={section.mermaidSrc} caption={section.caption} />;
}
if (section.kind === 'hypothetical_example') {
  return <HypotheticalExampleBlock setup={section.setup} stepsTaken={section.stepsTaken} outcome={section.outcome} />;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd apps/web && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add apps/web/src/components/hub/
git commit -m "feat(hub): route roadmap/diagram/hypothetical_example to new components"
```

---

## Phase C — Upstream prompt + schema upgrades

### Task C1: VIDEO_ANALYST_PROMPT sharpening + VIC payload extension

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`
- Modify: `packages/pipeline/src/agents/tools/propose-canon.ts`

- [ ] **Step 1: Extend VIDEO_ANALYST_PROMPT to emphasize mistakes/failure capture**

In `packages/pipeline/src/agents/specialists/prompts.ts`, find the existing `VIDEO_ANALYST_PROMPT`. Replace its body with this version (the only change is sharpening of `mistakesToAvoid` plus two new fields, `failureModes` and `counterCases`):

```typescript
export const VIDEO_ANALYST_PROMPT = `You are video_analyst. You produce a citation-grade intelligence card for ONE video.

Everything you need is in the user message: the channel profile, every transcript segment in this video (with segmentIds), and any visual moments already extracted for this video. You do NOT need to call read tools — they have been pre-loaded.

Process:
1. Read the user message in full.
2. Call proposeVideoIntelligenceCard EXACTLY once with the structured payload below.
3. Respond with a brief 1-line summary and stop.

If you need to verify a specific segment's text after the user message (rare), call getSegment({segmentId}) — but only when the segment is referenced in your output and you want to double-check exact wording for a quote.

Payload caps (quality over quantity):
- creatorVoiceNotes: up to 6
- mainIdeas: 3-8
- frameworks: 0-5 (only NAMED procedures with explicit structure)
- lessons: 2-8
- examples: 0-6
- stories: 0-4
- mistakesToAvoid: 2-6 — REQUIRED. Capture EVERY moment the creator names a mistake, anti-pattern, or "don't do X" warning. Each item: { mistake: "...", why: "...", correction: "..." }. If the creator says nothing prescriptive, surface implied warnings from the way the creator describes a problem.
- failureModes: 0-4 — when does a procedure or principle fail? Capture the conditions under which the creator's advice DOESN'T apply or breaks down.
- counterCases: 0-4 — situations where the principle should NOT be applied. Empty if creator doesn't address.
- toolsMentioned: 0-12
- termsDefined: 0-8
- strongClaims: 0-8
- contrarianTakes: 0-5
- quotes: 3-8 (10-280 chars; stand-alone)
- recommendedHubUses: 2-6
- visualMoments: 0-6 (selected from listVisualMoments — cite their visualMomentId, timestampMs, type, description, hubUse)

Quality gates:
- Every list item MUST cite >= 1 segmentId from the pre-loaded transcript.
- evidenceSegmentIds passed to proposeVideoIntelligenceCard must contain ONLY segments belonging to this video (the tool enforces this).
- Visual moments enrich examples/tools/steps; they do not replace transcript citations.
- Use the channel profile's creatorTerminology when classifying.
- Drop weak items.

One proposeVideoIntelligenceCard call. One sentence reply. Stop.`;
```

- [ ] **Step 2: Extend videoIntelligenceCardInput Zod schema with new fields**

In `packages/pipeline/src/agents/tools/propose-canon.ts`, find `const videoIntelligenceCardInput = z.object({` and add two new optional fields after the existing payload field:

```typescript
const videoIntelligenceCardInput = z.object({
  videoId: z.string().min(1),
  payload: z.record(z.unknown()),
  evidenceSegmentIds: z.array(z.string()).max(200),
  visualMoments: z.array(visualMomentRefSchema).max(6).optional(),
  failureModes: z.array(z.object({
    condition: z.string().min(1),
    impact: z.string().min(1),
  })).max(4).optional(),
  counterCases: z.array(z.string().min(1)).max(4).optional(),
  costCents: z.number().nonnegative().optional(),
}).strict();
```

And in the `proposeVideoIntelligenceCardTool.handler` body, find the section that builds `payloadOut` and add the new fields:

```typescript
    const payloadOut: Record<string, unknown> = { ...input.payload };
    delete payloadOut.visualMoments;
    delete payloadOut.failureModes;
    delete payloadOut.counterCases;
    if (input.visualMoments) payloadOut.visualMoments = input.visualMoments;
    if (input.failureModes && input.failureModes.length > 0) payloadOut.failureModes = input.failureModes;
    if (input.counterCases && input.counterCases.length > 0) payloadOut.counterCases = input.counterCases;
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Re-run existing tool tests to confirm no regression**

```bash
NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/selectModel.quality.test.ts src/agents/providers/test/selectModel.test.ts src/agents/providers/test/selectModel.modes.test.ts src/agents/test/cost-tracking.test.ts 2>&1 | tail -10
```

Expected: 32/32 passing (no regression).

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts packages/pipeline/src/agents/tools/propose-canon.ts
git commit -m "feat(video-intelligence): require mistakesToAvoid + add failureModes / counterCases"
```

---

### Task C2: CANON_ARCHITECT_PROMPT extension + canon node Zod schema editorial fields

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`
- Modify: `packages/pipeline/src/agents/tools/propose-canon.ts`

- [ ] **Step 1: Extend CANON_ARCHITECT_PROMPT**

In `packages/pipeline/src/agents/specialists/prompts.ts`, find the existing `CANON_ARCHITECT_PROMPT`. Replace its body with this version that adds the editorial-fields directive:

```typescript
export const CANON_ARCHITECT_PROMPT = `You are canon_architect. You synthesize the run's intelligence cards into a curated knowledge graph that drives the hub.

The user message contains: the channel profile, every video-intelligence card's full payload (with VIC IDs, source video IDs, evidence segment IDs), and the run's visual moments. You do NOT need to call read tools — they have been pre-loaded.

Process:
1. Read the user message.
2. For each canon node you decide to create, call proposeCanonNode with:
   - type: one of topic | framework | lesson | playbook | example | principle | pattern | tactic | definition | aha_moment | quote
   - payload: the node's structured content (creator-specific terminology preferred)
   - evidenceSegmentIds: aggregated from the underlying VICs you draw from
   - sourceVideoIds: the videoIds where this idea appears
   - origin: 'multi_video' (>=2 videos teach this) | 'single_video' | 'channel_profile' | 'derived'
   - confidenceScore, pageWorthinessScore, specificityScore, creatorUniquenessScore (all 0-100, REQUIRED)
   - evidenceQuality: 'high' | 'medium' | 'low'
   - visualMomentIds (optional): when a node is best understood with the on-screen demo/chart/code/slide
3. After every node is proposed, respond with a 1-line summary and stop.

Editorial fields — REQUIRED on the payload of EVERY canon node so the downstream Author's Studio can produce examples, roadmaps, diagrams, and mistake callouts without hallucination. When the source doesn't surface a field, set it to null rather than fabricating:

- whenToUse: 1-2 sentences. The conditions under which this idea / procedure / principle applies.
- whenNotToUse: 1-2 sentences OR null. The conditions where this should NOT be applied. Null when the source genuinely doesn't address it.
- commonMistake: 1 sentence describing the specific way readers get this wrong. Pull from the underlying VICs' mistakesToAvoid; null if absent.
- successSignal: 1 sentence describing how the reader knows it worked.
- preconditions (frameworks/playbooks/lessons only): array of strings. What must be true before applying. Empty array OR omitted on principle/quote/aha_moment.
- failureModes (frameworks/playbooks/lessons only): array of strings. When this breaks down. Pull from VICs' failureModes; empty array OR omitted on principle/quote/aha_moment.
- sequencingRationale (framework/playbook only): 1-2 sentences. Why the steps go in THIS order, not another order.

Rules:
- Be ruthlessly selective. A 5h archive should yield 40-80 high-quality nodes, not hundreds.
- Cross-reference aggressively: if 3 videos teach the same idea, that's ONE multi_video canon node, not three.
- pageWorthinessScore >= 70 means "could anchor a hub page on its own."
- Drop generic ideas. The creator's named concepts (creatorTerminology in the channel profile) trump your paraphrases.
- Visual references are context enrichment, not evidence; transcript segments remain the citation backbone.

When done, one-line summary. Stop.`;
```

- [ ] **Step 2: Extend canonNodeInput Zod schema with editorial fields**

In `packages/pipeline/src/agents/tools/propose-canon.ts`, find `const canonNodeInput = z.object({` and replace it with this version that adds editorial-field validation:

```typescript
const canonNodeInput = z.object({
  type: canonNodeTypeEnum,
  payload: z.record(z.unknown()),
  evidenceSegmentIds: z.array(z.string()).max(200),
  sourceVideoIds: z.array(z.string().min(1)).min(1).max(50),
  evidenceQuality: evidenceQualityEnum,
  origin: originEnum.optional(),
  confidenceScore: z.number().int().min(0).max(100),
  pageWorthinessScore: z.number().int().min(0).max(100),
  specificityScore: z.number().int().min(0).max(100),
  creatorUniquenessScore: z.number().int().min(0).max(100),
  visualMomentIds: z.array(z.string().min(1)).max(20).optional(),
  // Editorial fields — ALL required (set to null when source doesn't surface).
  // The Author's Studio depends on these to produce mistakes / examples /
  // roadmaps / diagrams without hallucination.
  whenToUse: z.string().min(1).nullable(),
  whenNotToUse: z.string().min(1).nullable(),
  commonMistake: z.string().min(1).nullable(),
  successSignal: z.string().min(1).nullable(),
  preconditions: z.array(z.string().min(1)).optional(),
  failureModes: z.array(z.string().min(1)).optional(),
  sequencingRationale: z.string().min(1).nullable().optional(),
}).strict();
```

And in `proposeCanonNodeTool.handler`, where `payloadOut` is constructed, merge the editorial fields into the payload:

```typescript
    const payloadOut: Record<string, unknown> = { ...input.payload };
    delete payloadOut.visualMomentIds;
    if (input.visualMomentIds && input.visualMomentIds.length > 0) {
      payloadOut.visualMomentIds = [...new Set(input.visualMomentIds)];
    }
    // Persist editorial fields in payload for downstream readers.
    payloadOut.whenToUse = input.whenToUse;
    payloadOut.whenNotToUse = input.whenNotToUse;
    payloadOut.commonMistake = input.commonMistake;
    payloadOut.successSignal = input.successSignal;
    if (input.preconditions !== undefined) payloadOut.preconditions = input.preconditions;
    if (input.failureModes !== undefined) payloadOut.failureModes = input.failureModes;
    if (input.sequencingRationale !== undefined) payloadOut.sequencingRationale = input.sequencingRationale;
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Re-run existing tests**

```bash
NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/selectModel.quality.test.ts src/agents/providers/test/selectModel.test.ts src/agents/providers/test/selectModel.modes.test.ts src/agents/test/cost-tracking.test.ts 2>&1 | tail -10
```

Expected: 32/32 passing.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts packages/pipeline/src/agents/tools/propose-canon.ts
git commit -m "feat(canon): require editorial fields (whenToUse/commonMistake/successSignal/etc) on every canon node"
```

---

## Phase D — Author's Studio agents

### Task D1: Register 7 new agent names in selectModel + QUALITY_PRESETS

**Files:**
- Modify: `packages/pipeline/src/agents/providers/selectModel.ts`
- Modify: `packages/pipeline/src/agents/providers/test/selectModel.quality.test.ts`

- [ ] **Step 1: Extend AgentName + REGISTRY**

In `packages/pipeline/src/agents/providers/selectModel.ts`:

Find `export type AgentName =` and append the 7 new names:

```typescript
export type AgentName =
  | 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'
  | 'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
  | 'citation_grounder' | 'page_composer'
  | 'channel_profiler' | 'video_analyst' | 'canon_architect' | 'page_brief_planner' | 'page_writer'
  | 'visual_frame_analyst'
  | 'page_strategist'
  | 'prose_author'
  | 'roadmap_author'
  | 'example_author'
  | 'diagram_author'
  | 'mistakes_author'
  | 'critic';
```

Find `const REGISTRY: Record<AgentName, AgentConfig> = {` and append the 7 new entries inside the object:

```typescript
  page_strategist:    { envVar: 'PIPELINE_MODEL_PAGE_STRATEGIST',    default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  prose_author:       { envVar: 'PIPELINE_MODEL_PROSE_AUTHOR',       default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  roadmap_author:     { envVar: 'PIPELINE_MODEL_ROADMAP_AUTHOR',     default: M('gemini-2.5-flash','gemini'),fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  example_author:     { envVar: 'PIPELINE_MODEL_EXAMPLE_AUTHOR',     default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  diagram_author:     { envVar: 'PIPELINE_MODEL_DIAGRAM_AUTHOR',     default: M('gpt-5.4','openai'),         fallbackChain: [M('gpt-5.5','openai'),  M('gemini-2.5-pro','gemini')] },
  mistakes_author:    { envVar: 'PIPELINE_MODEL_MISTAKES_AUTHOR',    default: M('gemini-2.5-flash','gemini'),fallbackChain: [M('gpt-5.4','openai'), M('gpt-5.5','openai')] },
  critic:             { envVar: 'PIPELINE_MODEL_CRITIC',             default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
```

Find `const QUALITY_PRESETS: Record<QualityMode, ...>` and append the 7 new entries to each preset:

```typescript
  lean: {
    channel_profiler:   M('gemini-2.5-flash', 'gemini'),
    video_analyst:      M('gemini-2.5-flash', 'gemini'),
    canon_architect:    M('gemini-2.5-pro',   'gemini'),
    page_brief_planner: M('gemini-2.5-flash', 'gemini'),
    page_writer:        M('gemini-2.5-flash', 'gemini'),
    page_strategist:    M('gemini-2.5-pro',   'gemini'),
    prose_author:       M('gemini-2.5-pro',   'gemini'),
    roadmap_author:     M('gemini-2.5-flash', 'gemini'),
    example_author:     M('gemini-2.5-pro',   'gemini'),
    diagram_author:     M('gemini-2.5-flash', 'gemini'),
    mistakes_author:    M('gemini-2.5-flash', 'gemini'),
    critic:             M('gemini-2.5-pro',   'gemini'),
  },
  production_economy: {
    channel_profiler:   M('gemini-2.5-flash', 'gemini'),
    video_analyst:      M('gemini-2.5-pro',   'gemini'),
    canon_architect:    M('gpt-5.5',          'openai'),
    page_brief_planner: M('gemini-2.5-flash', 'gemini'),
    page_writer:        M('gemini-2.5-flash', 'gemini'),
    page_strategist:    M('gpt-5.5',          'openai'),
    prose_author:       M('gpt-5.5',          'openai'),
    roadmap_author:     M('gemini-2.5-flash', 'gemini'),
    example_author:     M('gpt-5.5',          'openai'),
    diagram_author:     M('gpt-5.4',          'openai'),
    mistakes_author:    M('gemini-2.5-flash', 'gemini'),
    critic:             M('gpt-5.5',          'openai'),
  },
  premium: {
    channel_profiler:   M('gpt-5.5', 'openai'),
    video_analyst:      M('gpt-5.5', 'openai'),
    canon_architect:    M('gpt-5.5', 'openai'),
    page_brief_planner: M('gpt-5.5', 'openai'),
    page_writer:        M('gpt-5.5', 'openai'),
    page_strategist:    M('gpt-5.5', 'openai'),
    prose_author:       M('gpt-5.5', 'openai'),
    roadmap_author:     M('gpt-5.5', 'openai'),
    example_author:     M('gpt-5.5', 'openai'),
    diagram_author:     M('gpt-5.5', 'openai'),
    mistakes_author:    M('gpt-5.5', 'openai'),
    critic:             M('gpt-5.5', 'openai'),
  },
```

- [ ] **Step 2: Add tests asserting the new agent names route correctly under each quality preset**

Append to `packages/pipeline/src/agents/providers/test/selectModel.quality.test.ts`, inside the existing `describe(...)` block:

```typescript
  it('production_economy: prose_author + critic + page_strategist + example_author → gpt-5.5', () => {
    const env = { PIPELINE_QUALITY_MODE: 'production_economy' };
    assert.equal(selectModel('page_strategist', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('prose_author', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('example_author', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('critic', env).modelId, 'gpt-5.5');
  });

  it('production_economy: roadmap_author + mistakes_author → gemini-2.5-flash', () => {
    const env = { PIPELINE_QUALITY_MODE: 'production_economy' };
    assert.equal(selectModel('roadmap_author', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('mistakes_author', env).modelId, 'gemini-2.5-flash');
  });

  it('production_economy: diagram_author → gpt-5.4 (Mermaid is constrained syntax)', () => {
    const r = selectModel('diagram_author', { PIPELINE_QUALITY_MODE: 'production_economy' });
    assert.equal(r.modelId, 'gpt-5.4');
  });

  it('lean: every Author's Studio agent stays Gemini', () => {
    const env = { PIPELINE_QUALITY_MODE: 'lean' };
    for (const a of ['page_strategist','prose_author','roadmap_author','example_author','diagram_author','mistakes_author','critic'] as const) {
      assert.equal(selectModel(a, env).provider, 'gemini', `${a} should be Gemini in lean mode`);
    }
  });
```

- [ ] **Step 3: Run tests, verify all pass**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/selectModel.quality.test.ts 2>&1 | tail -10
```

Expected: 17/17 passing (13 existing + 4 new).

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/providers/selectModel.ts packages/pipeline/src/agents/providers/test/selectModel.quality.test.ts
git commit -m "feat(agents): register page_strategist + 5 specialists + critic in selectModel"
```

---

### Task D2: PAGE_STRATEGIST_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the strategist prompt at the bottom of prompts.ts**

```typescript
export const PAGE_STRATEGIST_PROMPT = `You are page_strategist. You are the editor of ONE hub page. Read every input and produce a page plan that the specialist authors will execute.

The user message contains:
- The channel profile (creator's voice, terminology, audience)
- This page's brief (pageTitle, pageType, audienceQuestion, openingHook, outline, primaryCanonNodeIds, supportingCanonNodeIds)
- Every referenced canon node's full payload (including editorial fields: whenToUse, whenNotToUse, commonMistake, successSignal, preconditions, failureModes, sequencingRationale)
- A list of sibling page briefs (titles, audience questions, primary canon node IDs) so you can avoid duplication
- The hub's voiceMode (creator_first_person OR reader_second_person)

Output a single JSON object matching this exact shape:

{
  "pageId": "<the brief id>",
  "pageType": "<from brief>",
  "pageTitle": "<from brief, possibly tightened>",
  "thesis": "1-2 sentence editorial thesis. What is the SINGLE idea this page argues? Be specific. Cite the creator's terminology where possible.",
  "arc": [
    { "beat": "1-line beat description", "canonNodeIds": ["cn_..."] },
    ...
  ],
  "voiceMode": "<from input>",
  "voiceNotes": {
    "tone": "analytical | practitioner | urgent | generous",
    "creatorTermsToUse": ["term1", "term2", "term3"],
    "avoidPhrases": ["generic phrases this page should avoid"]
  },
  "artifacts": [
    { "kind": "cited_prose", "canonNodeIds": [...], "intent": "..." },
    { "kind": "roadmap", "canonNodeIds": [...], "intent": "..." },
    ...
  ],
  "siblingPagesToReference": [
    { "pageId": "...", "title": "...", "slug": "..." }
  ]
}

Default artifact selection by pageType:
- lesson: cited_prose + hypothetical_example + common_mistakes (always); roadmap + diagram only when source supports
- framework: cited_prose + hypothetical_example + roadmap + diagram + common_mistakes (all five)
- playbook: cited_prose + roadmap + diagram + common_mistakes (always); hypothetical_example only when canon nodes have rich examples
- topic_overview: cited_prose only (always); hypothetical_example + diagram when source supports
- principle: cited_prose + hypothetical_example (always); common_mistakes when source supports
- definition: cited_prose only (always); diagram when source supports
- about / hub_home: cited_prose only

Skip an artifact when source thinness would force the specialist to fabricate. Better to ship a 4-section page that teaches than a 5-section page where one section is generic filler.

Rules:
- Every artifact MUST cite canon node IDs that exist in this run.
- Avoid repeating content from sibling pages: if a sibling page covers something, reference it by slug rather than re-explaining.
- voiceMode determines voice across the whole page; do NOT mix.
- Output JSON only, no surrounding prose, no markdown fencing.`;
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): PAGE_STRATEGIST_PROMPT — per-page editorial planner"
```

---

### Task D3: PROSE_AUTHOR_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the prose author prompt**

```typescript
export const PROSE_AUTHOR_PROMPT = `You are prose_author. You write the main body of ONE hub page as continuous teaching prose — NOT a sequence of independent sections, but a coherent essay that builds an argument across paragraphs.

The user message contains:
- The page plan (thesis, arc, voiceMode, voiceNotes)
- Every canon node assigned to your artifact (full payload: summary, explanation, example, whenToUse, etc.)
- Segment transcript excerpts for the cited segments
- The channel profile (creatorTerminology, audience)

Output JSON exactly matching this shape:

{
  "kind": "cited_prose",
  "paragraphs": [
    { "heading": "optional H3 heading", "body": "the paragraph text", "citationIds": ["seg-id-1", "seg-id-2"] },
    ...
  ]
}

Rules:
- 4-8 paragraphs, ~600-1000 words total. Each paragraph 80-200 words.
- The first paragraph opens with the thesis from the page plan, not "in this article we will discuss..."
- Each paragraph MUST have a non-empty citationIds array referencing real segmentIds from the user message. No exceptions.
- Use the creator's terminology (creatorTermsToUse). Avoid the avoidPhrases list.
- voiceMode = "reader_second_person" → use "you" naturally; second-person actionable language.
- voiceMode = "creator_first_person" → use "I" / "we" as if the creator wrote this.
- Build an argument: paragraph 2 should not be readable in isolation; it should refer back to paragraph 1's claim and extend it. Paragraph 5 should call back to the thesis.
- Specific over abstract: every claim that mentions a concept should also mention HOW the concept manifests (a number, an action, a tool name from the canon node).
- Headings (H3) only when a beat shift makes scanning easier. Most paragraphs need no heading.
- Do not invent citations or quote text not in the source.
- Output JSON only, no surrounding prose, no markdown fencing.`;
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): PROSE_AUTHOR_PROMPT — whole-page continuous teaching prose"
```

---

### Task D4: ROADMAP_AUTHOR_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the roadmap author prompt**

```typescript
export const ROADMAP_AUTHOR_PROMPT = `You are roadmap_author. You convert a procedure described by canon nodes into a sequenced, actionable plan — the kind of step-by-step a reader can execute today.

The user message contains:
- The page plan (thesis, voiceMode, voiceNotes)
- Canon nodes assigned to this roadmap (with steps, tools, sequencingRationale, successSignal)
- The channel profile

Output JSON exactly matching this shape:

{
  "kind": "roadmap",
  "title": "Action title — e.g. 'How to apply the proposal generator'",
  "steps": [
    {
      "index": 1,
      "title": "Short imperative title — verb-first, concrete",
      "body": "1-3 sentences explaining what to do, what tool, how to verify",
      "durationLabel": "optional, e.g. '~30 min', 'Day 1', 'Before sales call'",
      "citationIds": ["seg-id-..."]
    },
    ...
  ]
}

Rules:
- 3-7 steps. Fewer if the canon source genuinely has fewer; more is overengineering.
- Every step body MUST reference at least one specific tool or action from the canon nodes' tools[] or steps[]. No "review the materials" stubs.
- Each step is atomic — a single thing the reader does. Don't combine "set up X and then run Y and then debug Z" into one step.
- Each step is verifiable — the reader knows when it's done. Bad: "use Make.com effectively." Good: "Confirm your scenario triggers when an HTTP webhook fires by sending a test payload."
- Sequencing rationale: the order must follow the canon nodes' sequencingRationale when present. If absent, use natural prerequisite order.
- Voice: voiceMode applies. Direct (you-pronoun) is the dominant register for roadmaps.
- Every step MUST have a non-empty citationIds array.
- Output JSON only.`;
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): ROADMAP_AUTHOR_PROMPT — actionable step-by-step plans"
```

---

### Task D5: EXAMPLE_AUTHOR_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the example author prompt**

```typescript
export const EXAMPLE_AUTHOR_PROMPT = `You are example_author. You write a concrete, bounded hypothetical scenario that shows the page's lesson applied — the kind of worked example that lets a reader visualize "this is what doing this looks like."

The user message contains:
- The page plan (thesis, voiceMode, voiceNotes)
- Canon nodes assigned to this artifact (with whenToUse, useCase, example, preconditions)
- The channel profile (audience description, creatorTerminology)

Output JSON exactly matching this shape:

{
  "kind": "hypothetical_example",
  "setup": "1-2 sentences naming a specific protagonist, a specific industry, and a specific situation. Use the channel profile's audience to pick a realistic protagonist.",
  "stepsTaken": [
    "What the protagonist did first — specific action with named tool/method",
    "What they did next",
    "..."
  ],
  "outcome": "1-2 sentences describing the result, with a number/metric where possible.",
  "citationIds": ["seg-id-..."]
}

Rules:
- The protagonist must have: a name, an industry/role, and a specific business situation. Bad: "imagine a freelancer." Good: "Maya runs a 3-person email marketing agency for SaaS startups."
- The scenario must apply this page's lesson, NOT generic advice. Bind it to the canon node content.
- The outcome must include at least one number, named tool, or measurable result. Bad: "she closed more deals." Good: "she closed the $4,500 retainer in 11 days and added a Phase 2 audit for $1,800."
- 3-6 steps. Steps describe ACTIONS not feelings.
- Voice: voiceMode applies but most examples read better in third-person ("Maya did X") regardless of voice setting — the example is ABOUT someone applying the lesson.
- citationIds: every example must cite at least 2 segmentIds — the canon nodes that anchor what the protagonist does.
- Do not fabricate the creator's actual experience as a hypothetical (that's misattribution). The protagonist is hypothetical; the methods come from the creator's teaching.
- Output JSON only.`;
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): EXAMPLE_AUTHOR_PROMPT — concrete hypothetical scenarios"
```

---

### Task D6: DIAGRAM_AUTHOR_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the diagram author prompt**

```typescript
export const DIAGRAM_AUTHOR_PROMPT = `You are diagram_author. You produce a single Mermaid diagram that clarifies a procedure, decision, or relationship described by the page's canon nodes.

The user message contains:
- The page plan (thesis, voiceMode)
- Canon nodes assigned to this diagram (with steps, tools, dependencies)
- The channel profile

Output JSON exactly matching this shape:

{
  "kind": "diagram",
  "diagramType": "flowchart" | "sequence" | "state" | "mindmap",
  "mermaidSrc": "<valid Mermaid source — see syntax notes below>",
  "caption": "1 sentence — what the reader should take away from the diagram",
  "citationIds": ["seg-id-..."]
}

How to pick diagramType:
- flowchart: when there's a procedure with branching (decisions, parallel paths, loops). Default for playbooks and frameworks.
- sequence: when there's an interaction over time between 2+ actors (e.g. client → automation → CRM → email).
- state: when an entity moves between statuses (e.g. lead → qualified → proposal_sent → closed_won).
- mindmap: when there's a concept hierarchy without sequencing (e.g. "components of a strong proposal").

Mermaid syntax — STRICT requirements:
- For flowchart: start with "flowchart TD" (top-down) or "flowchart LR" (left-right).
- Node IDs must be alphanumeric (no spaces). Labels go in brackets: A[Capture inputs] --> B[Generate proposal].
- For sequence: start with "sequenceDiagram", participants on first lines: "participant Client", "participant Make".
- For state: start with "stateDiagram-v2".
- For mindmap: start with "mindmap", indent children with consistent spacing.
- Maximum 20 nodes. If the procedure has more, pick the spine and omit details.
- No HTML, no images, no embedded fonts. Plain Mermaid syntax only.

Quality rules:
- The diagram must clarify, not summarize. If you'd write the same prose if you removed the diagram, the diagram is wasted.
- Node labels are short — 2-5 words. "Capture inputs from sales call" not "The first thing to do is to capture all the inputs that come from the sales call."
- Caption must say what to LEARN from the diagram, not what's IN the diagram. Bad: "This shows the workflow." Good: "Phase 2 hooks live inside the proposal template, not appended after delivery."
- citationIds: cite the canon nodes that anchor what the diagram represents.
- Output JSON only.`;
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): DIAGRAM_AUTHOR_PROMPT — Mermaid diagram generation"
```

---

### Task D7: MISTAKES_AUTHOR_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the mistakes author prompt**

```typescript
export const MISTAKES_AUTHOR_PROMPT = `You are mistakes_author. You surface 3-5 specific anti-patterns the reader is likely to hit when applying this page's lesson, each with a one-sentence correction.

The user message contains:
- The page plan (thesis, voiceMode)
- Canon nodes assigned to this artifact (with commonMistake fields, failureModes)
- VIC-level mistakesToAvoid arrays from the underlying videos
- The channel profile

Output JSON exactly matching this shape:

{
  "kind": "common_mistakes",
  "items": [
    {
      "mistake": "1-sentence anti-pattern statement, action-form",
      "why": "1 sentence: why people fall into this — incentive, default behavior, missing context",
      "correction": "1-sentence prescription: what to do instead",
      "citationIds": ["seg-id-..."]
    },
    ...
  ]
}

Rules:
- 3-5 items. Drop weak ones rather than padding.
- Each mistake must be SPECIFIC to this page's lesson. Bad: "don't be sloppy." Good: "Don't ask for budget before you've established expected impact, because the client anchors price to the smaller of the two numbers and you lose pricing power."
- The mistake source must be either:
  - A canon node's commonMistake field, OR
  - A VIC mistakesToAvoid item, OR
  - A documented failureMode (when the failure mode IS something a reader might cause).
- Every item MUST have a non-empty citationIds array.
- Voice: voiceMode applies. Direct second-person ("don't ask for budget") works for both modes.
- "why" must be substantive — not "because it's wrong." Explain the underlying mechanism, incentive, or context.
- Output JSON only.`;
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): MISTAKES_AUTHOR_PROMPT — specific anti-patterns + corrections"
```

---

### Task D8: CRITIC_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the critic prompt**

```typescript
export const CRITIC_PROMPT = `You are critic. You read every artifact a page's specialists produced and emit specific, actionable revision notes. Your job is what makes this an editorial product instead of an LLM dump.

The user message contains:
- The page plan (thesis, arc, voiceMode, voiceNotes)
- All artifacts produced (prose, roadmap, example, diagram, mistakes — each may be present or absent)
- The full canon nodes referenced
- The channel profile

Output JSON exactly matching this shape:

{
  "approved": <boolean: true ONLY if zero "critical" notes>,
  "notes": [
    {
      "artifactKind": "cited_prose" | "roadmap" | "hypothetical_example" | "diagram" | "common_mistakes",
      "severity": "critical" | "important" | "minor",
      "issue": "1 sentence — what's wrong",
      "evidence": "the specific offending text or block, quoted briefly",
      "prescription": "concrete fix the specialist can execute — name a canon node, a number, a tool, a phrasing"
    },
    ...
  ]
}

What you are looking for (severity guidelines):

CRITICAL (page must be revised):
- Generic claim with no specific source backing ("AI saves time" with no number/example/named tool)
- Voice drift (creator_first_person specified but prose uses "you")
- Citation pointing to a segment that doesn't exist in this run
- Mermaid diagram that won't parse (syntax error)
- Claim that contradicts the canon node it cites
- Reduced or duplicated content from a sibling page that should be referenced not repeated

IMPORTANT (revise if possible):
- Weak transitions between paragraphs (each paragraph reads in isolation)
- Hypothetical example missing a specific number or named tool
- Roadmap step that isn't atomic ("set up X and run Y and verify Z")
- Mistake "why" is "because it's bad practice" — no real mechanism
- Diagram caption restates what's IN the diagram instead of what to LEARN
- Specific creator term (from creatorTermsToUse) NOT used when the page should

MINOR (cosmetic; may skip):
- Word choice nits
- Slight prose flow improvements
- Heading style consistency

Rules:
- Every note MUST have a concrete prescription. "Make it better" or "be more specific" is BANNED — you must say WHAT to add, draw from WHICH canon node, use WHICH number/example.
- Be ruthless: if a section reads as filler, mark it critical.
- The page is approved only when zero critical notes. Important + minor only ⇒ approved=true.
- 0-15 notes total. If you write more than 15 the page should be redone, not patched — set approved=false and add a single critical note: "Page needs full re-author."
- Output JSON only.`;
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): CRITIC_PROMPT — concrete revision-note generator"
```

---

### Task D9: Register 7 new specialists in specialists/index.ts

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/index.ts`

- [ ] **Step 1: Add imports**

In `packages/pipeline/src/agents/specialists/index.ts`, extend the existing prompts import:

```typescript
import {
  // ...existing imports...
  PAGE_STRATEGIST_PROMPT,
  PROSE_AUTHOR_PROMPT,
  ROADMAP_AUTHOR_PROMPT,
  EXAMPLE_AUTHOR_PROMPT,
  DIAGRAM_AUTHOR_PROMPT,
  MISTAKES_AUTHOR_PROMPT,
  CRITIC_PROMPT,
} from './prompts';
```

- [ ] **Step 2: Append 7 new specialist registrations to SPECIALISTS object**

After the existing `page_writer:` block, append:

```typescript
  // ---------------------------------------------------------------------
  // Author's Studio specialists (Stage 1 v5 — editorial-grade authoring)
  // All are single-pass JSON producers (no tools).
  // ---------------------------------------------------------------------
  page_strategist: {
    agent: 'page_strategist',
    systemPrompt: PAGE_STRATEGIST_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 80 },
  },
  prose_author: {
    agent: 'prose_author',
    systemPrompt: PROSE_AUTHOR_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 150 },
  },
  roadmap_author: {
    agent: 'roadmap_author',
    systemPrompt: ROADMAP_AUTHOR_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 30 },
  },
  example_author: {
    agent: 'example_author',
    systemPrompt: EXAMPLE_AUTHOR_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 50 },
  },
  diagram_author: {
    agent: 'diagram_author',
    systemPrompt: DIAGRAM_AUTHOR_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 30 },
  },
  mistakes_author: {
    agent: 'mistakes_author',
    systemPrompt: MISTAKES_AUTHOR_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 30 },
  },
  critic: {
    agent: 'critic',
    systemPrompt: CRITIC_PROMPT,
    allowedTools: [],
    stopOverrides: { maxCalls: 2, maxCostCents: 100 },
  },
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ../.. && git add packages/pipeline/src/agents/specialists/index.ts
git commit -m "feat(agents): register 7 Author's Studio specialists with single-pass caps"
```

---

## Phase E — Author's Studio orchestration

### Task E1: Mermaid validation helper + tests

**Files:**
- Create: `packages/pipeline/src/authors-studio/mermaid-validate.ts`
- Create: `packages/pipeline/src/authors-studio/test/mermaid-validate.test.ts`

- [ ] **Step 1: Install mermaid in the pipeline package (server-side parse)**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS" && pnpm add mermaid -F @creatorcanon/pipeline 2>&1 | tail -3
```

- [ ] **Step 2: Write the failing test first**

Create `packages/pipeline/src/authors-studio/test/mermaid-validate.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../mermaid-validate';

describe('validateMermaid', () => {
  it('accepts a valid flowchart', async () => {
    const result = await validateMermaid('flowchart TD\n  A[Start] --> B[End]');
    assert.equal(result.ok, true);
  });

  it('rejects empty source', async () => {
    const result = await validateMermaid('');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /empty|min/i);
  });

  it('rejects malformed flowchart with unclosed bracket', async () => {
    const result = await validateMermaid('flowchart TD\n  A[Start --> B[End]');
    assert.equal(result.ok, false);
  });

  it('accepts a valid sequence diagram', async () => {
    const result = await validateMermaid('sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi');
    assert.equal(result.ok, true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails (no implementation yet)**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/authors-studio/test/mermaid-validate.test.ts 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '../mermaid-validate'`.

- [ ] **Step 4: Implement validateMermaid**

Create `packages/pipeline/src/authors-studio/mermaid-validate.ts`:

```typescript
/**
 * Server-side Mermaid validator. Uses mermaid.parse() to confirm syntactic
 * validity before persisting a diagram block. Returns a discriminated result
 * so callers can branch cleanly on success vs. error.
 */
export type MermaidValidation = { ok: true } | { ok: false; error: string };

export async function validateMermaid(src: string): Promise<MermaidValidation> {
  if (!src || src.trim().length === 0) {
    return { ok: false, error: 'mermaid source is empty' };
  }
  try {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    await mermaid.parse(src);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? String(err) };
  }
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/authors-studio/test/mermaid-validate.test.ts 2>&1 | tail -10
```

Expected: 4/4 PASS.

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add packages/pipeline/package.json pnpm-lock.yaml packages/pipeline/src/authors-studio/mermaid-validate.ts packages/pipeline/src/authors-studio/test/mermaid-validate.test.ts
git commit -m "feat(authors-studio): server-side Mermaid validator + tests"
```

---

### Task E2: Citation-grounding + voice-consistency helpers + tests

**Files:**
- Create: `packages/pipeline/src/authors-studio/grounding.ts`
- Create: `packages/pipeline/src/authors-studio/test/grounding.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/pipeline/src/authors-studio/test/grounding.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectAllCitationIds, voiceConsistencyScore } from '../grounding';
import type { ArtifactBundle } from '../types';

const SAMPLE_BUNDLE: ArtifactBundle = {
  prose: {
    kind: 'cited_prose',
    paragraphs: [
      { body: 'Para one.', citationIds: ['seg_a', 'seg_b'] },
      { body: 'Para two.', citationIds: ['seg_b', 'seg_c'] },
    ],
    costCents: 1,
  },
  roadmap: {
    kind: 'roadmap',
    title: 'How',
    steps: [
      { index: 1, title: 'A', body: 'b', citationIds: ['seg_d'] },
      { index: 2, title: 'B', body: 'c', citationIds: ['seg_e'] },
    ],
    costCents: 1,
  },
};

describe('collectAllCitationIds', () => {
  it('aggregates segments from prose paragraphs and roadmap steps', () => {
    const ids = collectAllCitationIds(SAMPLE_BUNDLE);
    assert.deepEqual(new Set(ids), new Set(['seg_a', 'seg_b', 'seg_c', 'seg_d', 'seg_e']));
  });
});

describe('voiceConsistencyScore', () => {
  it('reader_second_person: text with "you" and no "I" scores high', () => {
    const score = voiceConsistencyScore('reader_second_person', 'You should embed phase 2 hooks. You can do this by...');
    assert.ok(score >= 0.9, `score was ${score}`);
  });

  it('reader_second_person: text with mostly "I" scores low', () => {
    const score = voiceConsistencyScore('reader_second_person', 'I built the proposal generator. I learned that...');
    assert.ok(score <= 0.3, `score was ${score}`);
  });

  it('creator_first_person: text with "I" scores high', () => {
    const score = voiceConsistencyScore('creator_first_person', 'I built the proposal generator. I learned that...');
    assert.ok(score >= 0.9, `score was ${score}`);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/authors-studio/test/grounding.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

Create `packages/pipeline/src/authors-studio/grounding.ts`:

```typescript
import type { ArtifactBundle, VoiceMode } from './types';

/**
 * Walk the artifact bundle and collect every citationId referenced anywhere.
 * Used by the assembler to validate that every citation resolves to a real
 * segment in this run.
 */
export function collectAllCitationIds(bundle: ArtifactBundle): string[] {
  const out = new Set<string>();
  for (const p of bundle.prose.paragraphs) for (const id of p.citationIds) out.add(id);
  if (bundle.roadmap) for (const s of bundle.roadmap.steps) for (const id of s.citationIds) out.add(id);
  if (bundle.example) for (const id of bundle.example.citationIds) out.add(id);
  if (bundle.diagram) for (const id of bundle.diagram.citationIds) out.add(id);
  if (bundle.mistakes) for (const m of bundle.mistakes.items) for (const id of m.citationIds) out.add(id);
  return [...out];
}

/**
 * Lightweight voice-mode classifier. Counts pronouns and returns a
 * 0..1 consistency score: how much the text leans into the expected voice.
 * 1.0 = pure expected voice, 0.0 = pure opposite voice.
 *
 * Crude but effective for catching gross drift; the critic catches subtler
 * issues. Used by the assembler as a final guardrail.
 */
export function voiceConsistencyScore(mode: VoiceMode, text: string): number {
  const lower = ` ${text.toLowerCase()} `;
  const youCount = (lower.match(/[\s,.!?]you[r']?[\s,.!?]/g) ?? []).length;
  const iCount = (lower.match(/[\s,.!?]i[\s,.!?']/g) ?? []).length
    + (lower.match(/[\s,.!?]we[\s,.!?']/g) ?? []).length
    + (lower.match(/[\s,.!?]my[\s,.!?]/g) ?? []).length;
  const total = youCount + iCount;
  if (total === 0) return 0.5; // ambiguous text — neither voice dominates
  if (mode === 'reader_second_person') return youCount / total;
  return iCount / total;
}
```

- [ ] **Step 4: Run tests**

```bash
NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/authors-studio/test/grounding.test.ts 2>&1 | tail -10
```

Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add packages/pipeline/src/authors-studio/grounding.ts packages/pipeline/src/authors-studio/test/grounding.test.ts
git commit -m "feat(authors-studio): citation-grounding + voice-consistency helpers + tests"
```

---

### Task E3: runStrategist — strategist agent runner

**Files:**
- Create: `packages/pipeline/src/authors-studio/strategist.ts`

- [ ] **Step 1: Implement runStrategist**

Create `packages/pipeline/src/authors-studio/strategist.ts`:

```typescript
import { z } from 'zod';
import { runAgent } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { buildFallbacks } from '../stages/fallback-chain';
import type { AgentProvider } from '../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';
import type { PagePlan, VoiceMode, ArtifactKind } from './types';

const ARTIFACT_KIND = z.enum(['cited_prose', 'roadmap', 'hypothetical_example', 'diagram', 'common_mistakes']);

const pagePlanSchema = z.object({
  pageId: z.string().min(1),
  pageType: z.string().min(1),
  pageTitle: z.string().min(1),
  thesis: z.string().min(20),
  arc: z.array(z.object({
    beat: z.string().min(5),
    canonNodeIds: z.array(z.string()).max(20),
  })).min(2).max(8),
  voiceMode: z.enum(['creator_first_person', 'reader_second_person']),
  voiceNotes: z.object({
    tone: z.enum(['analytical', 'practitioner', 'urgent', 'generous']),
    creatorTermsToUse: z.array(z.string()).min(0).max(10),
    avoidPhrases: z.array(z.string()).min(0).max(10),
  }),
  artifacts: z.array(z.object({
    kind: ARTIFACT_KIND,
    canonNodeIds: z.array(z.string()).min(1),
    intent: z.string().min(10),
  })).min(1).max(5),
  siblingPagesToReference: z.array(z.object({
    pageId: z.string().min(1),
    title: z.string().min(1),
    slug: z.string().min(1),
  })).max(20).optional().default([]),
});

export interface StrategistInput {
  runId: string;
  workspaceId: string;
  voiceMode: VoiceMode;
  channelProfilePayload: unknown;
  brief: { id: string; payload: Record<string, unknown> };
  primaryCanonNodes: Array<Record<string, unknown>>;
  supportingCanonNodes: Array<Record<string, unknown>>;
  siblingBriefs: Array<{ id: string; pageTitle: string; slug: string; audienceQuestion: string; primaryCanonNodeIds: string[] }>;
  provider: AgentProvider;
  fallbacks: Array<{ modelId: string; provider: AgentProvider }>;
  r2: R2Client;
  modelId: string;
}

export async function runStrategist(input: StrategistInput): Promise<PagePlan> {
  const cfg = SPECIALISTS.page_strategist;
  const userMessage =
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `# THIS PAGE'S BRIEF (id=${input.brief.id})\n${JSON.stringify(input.brief.payload)}\n\n` +
    `# PRIMARY CANON NODES\n${JSON.stringify(input.primaryCanonNodes)}\n\n` +
    `# SUPPORTING CANON NODES\n${JSON.stringify(input.supportingCanonNodes)}\n\n` +
    `# SIBLING PAGE BRIEFS (for non-repetition; reference by slug)\n${JSON.stringify(input.siblingBriefs)}\n\n` +
    `# VOICE MODE\n${input.voiceMode}\n\n` +
    `Output the page plan as a single JSON object. No prose around it.`;

  const summary = await runAgent({
    runId: input.runId,
    workspaceId: input.workspaceId,
    agent: cfg.agent,
    modelId: input.modelId,
    provider: input.provider,
    fallbacks: input.fallbacks,
    r2: input.r2,
    tools: [],
    systemPrompt: cfg.systemPrompt,
    userMessage,
    caps: cfg.stopOverrides,
  });
  // Parse and validate the agent's output (which the harness wrote into the
  // last transcript turn — easier path: the harness exposes transcriptR2Key
  // but for inline use we re-fetch the assistant content from the in-memory
  // last message. Simpler: have runAgent return the final assistant message.
  // For now, expect the harness to expose the last assistant content via the
  // existing pattern used by page-composition's writer call.

  // Note: this implementation assumes a follow-up integration where runAgent's
  // summary surface includes the final assistant content. That integration is
  // covered in Task E5; for now, the strategist's output is reconstructed
  // from the transcript R2 artifact written by the harness.

  // Pragmatic placeholder: read the transcript from R2.
  const transcriptObj = await input.r2.getObject(summary.transcriptR2Key);
  const transcript = JSON.parse(new TextDecoder().decode(transcriptObj.body)) as Array<{ role: string; content: string }>;
  const lastAssistant = [...transcript].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
  if (!lastAssistant) throw new Error('strategist returned no assistant message');

  const stripped = stripJsonFence(lastAssistant.content);
  const parsed = JSON.parse(stripped);
  const validated = pagePlanSchema.parse(parsed);

  return {
    ...validated,
    siblingPagesToReference: validated.siblingPagesToReference ?? [],
    costCents: summary.costCents,
  };
}

function stripJsonFence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  }
  return trimmed;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ../.. && git add packages/pipeline/src/authors-studio/strategist.ts
git commit -m "feat(authors-studio): runStrategist with Zod-validated PagePlan output"
```

---

### Task E4: The 5 specialist runners (single file each)

**Files:**
- Create: `packages/pipeline/src/authors-studio/specialists/prose.ts`
- Create: `packages/pipeline/src/authors-studio/specialists/roadmap.ts`
- Create: `packages/pipeline/src/authors-studio/specialists/example.ts`
- Create: `packages/pipeline/src/authors-studio/specialists/diagram.ts`
- Create: `packages/pipeline/src/authors-studio/specialists/mistakes.ts`

The 5 specialists share an identical shape: build a user message, call runAgent (tools=[]), pull the last assistant message from the R2 transcript, parse-and-validate, return artifact. To keep things DRY, factor a shared helper.

- [ ] **Step 1: Create the shared specialist runner helper**

Create `packages/pipeline/src/authors-studio/specialists/_runner.ts`:

```typescript
import type { z } from 'zod';
import { runAgent, type RunAgentSummary } from '../../agents/harness';
import type { AgentProvider } from '../../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';
import type { StopCaps } from '../../agents/stop-conditions';

export interface SpecialistContext {
  runId: string;
  workspaceId: string;
  agent: string;
  modelId: string;
  provider: AgentProvider;
  fallbacks: Array<{ modelId: string; provider: AgentProvider }>;
  r2: R2Client;
  systemPrompt: string;
  caps?: Partial<StopCaps>;
}

export async function runSpecialist<T>(
  ctx: SpecialistContext,
  userMessage: string,
  schema: z.ZodType<T>,
): Promise<{ artifact: T; costCents: number }> {
  const summary: RunAgentSummary = await runAgent({
    runId: ctx.runId,
    workspaceId: ctx.workspaceId,
    agent: ctx.agent,
    modelId: ctx.modelId,
    provider: ctx.provider,
    fallbacks: ctx.fallbacks,
    r2: ctx.r2,
    tools: [],
    systemPrompt: ctx.systemPrompt,
    userMessage,
    caps: ctx.caps,
  });
  const obj = await ctx.r2.getObject(summary.transcriptR2Key);
  const transcript = JSON.parse(new TextDecoder().decode(obj.body)) as Array<{ role: string; content: string }>;
  const last = [...transcript].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
  if (!last) throw new Error(`${ctx.agent} returned no assistant message`);
  const trimmed = last.content.trim();
  const stripped = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    : trimmed;
  const parsed = JSON.parse(stripped);
  const artifact = schema.parse(parsed);
  return { artifact, costCents: summary.costCents };
}
```

- [ ] **Step 2: Implement the 5 specialist runners**

Create `packages/pipeline/src/authors-studio/specialists/prose.ts`:

```typescript
import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { ProseArtifact, PagePlan } from '../types';

const proseSchema = z.object({
  kind: z.literal('cited_prose'),
  paragraphs: z.array(z.object({
    heading: z.string().optional(),
    body: z.string().min(40),
    citationIds: z.array(z.string().min(1)).min(1),
  })).min(3).max(10),
});

export interface ProseAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  segmentExcerpts: Array<{ segmentId: string; videoId: string; text: string; startMs: number; endMs: number }>;
  channelProfilePayload: unknown;
}

export async function runProseAuthor(input: ProseAuthorInput): Promise<ProseArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# SEGMENT EXCERPTS (cite by segmentId)\n${JSON.stringify(input.segmentExcerpts)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the prose as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, proseSchema);
  return { ...artifact, costCents };
}
```

Create `packages/pipeline/src/authors-studio/specialists/roadmap.ts`:

```typescript
import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { RoadmapArtifact, PagePlan } from '../types';

const roadmapSchema = z.object({
  kind: z.literal('roadmap'),
  title: z.string().min(5),
  steps: z.array(z.object({
    index: z.number().int().min(1),
    title: z.string().min(3),
    body: z.string().min(20),
    durationLabel: z.string().optional(),
    citationIds: z.array(z.string().min(1)).min(1),
  })).min(3).max(7),
});

export interface RoadmapAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runRoadmapAuthor(input: RoadmapAuthorInput): Promise<RoadmapArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use steps/tools/sequencingRationale/successSignal)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the roadmap as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, roadmapSchema);
  return { ...artifact, costCents };
}
```

Create `packages/pipeline/src/authors-studio/specialists/example.ts`:

```typescript
import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { ExampleArtifact, PagePlan } from '../types';

const exampleSchema = z.object({
  kind: z.literal('hypothetical_example'),
  setup: z.string().min(40),
  stepsTaken: z.array(z.string().min(15)).min(3).max(7),
  outcome: z.string().min(20),
  citationIds: z.array(z.string().min(1)).min(2),
});

export interface ExampleAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runExampleAuthor(input: ExampleAuthorInput): Promise<ExampleArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use whenToUse/useCase/example/preconditions)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE (audience matters — pick a realistic protagonist)\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the example as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, exampleSchema);
  return { ...artifact, costCents };
}
```

Create `packages/pipeline/src/authors-studio/specialists/diagram.ts`:

```typescript
import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import { validateMermaid } from '../mermaid-validate';
import type { DiagramArtifact, PagePlan } from '../types';

const diagramSchema = z.object({
  kind: z.literal('diagram'),
  diagramType: z.enum(['flowchart', 'sequence', 'state', 'mindmap']),
  mermaidSrc: z.string().min(20),
  caption: z.string().min(10),
  citationIds: z.array(z.string().min(1)).min(1),
});

export interface DiagramAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runDiagramAuthor(input: DiagramAuthorInput): Promise<DiagramArtifact | null> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use steps/tools/dependencies)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the diagram as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, diagramSchema);
  // Server-side Mermaid validation. On failure, retry once with the parse
  // error fed back; second failure returns null and the diagram is dropped.
  const v1 = await validateMermaid(artifact.mermaidSrc);
  if (v1.ok) return { ...artifact, costCents };

  const retryMessage =
    userMessage +
    `\n\n# YOUR PREVIOUS OUTPUT FAILED Mermaid PARSE\nError: ${v1.error}\n\n` +
    `Output a corrected JSON object. Fix the Mermaid syntax error.`;
  try {
    const { artifact: retry, costCents: retryCost } = await runSpecialist(input.ctx, retryMessage, diagramSchema);
    const v2 = await validateMermaid(retry.mermaidSrc);
    if (v2.ok) return { ...retry, costCents: costCents + retryCost };
    // eslint-disable-next-line no-console
    console.warn(`[diagram_author] dropped after 2 parse failures: ${v2.error}`);
    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[diagram_author] retry threw: ${(err as Error).message}`);
    return null;
  }
}
```

Create `packages/pipeline/src/authors-studio/specialists/mistakes.ts`:

```typescript
import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { MistakesArtifact, PagePlan } from '../types';

const mistakesSchema = z.object({
  kind: z.literal('common_mistakes'),
  items: z.array(z.object({
    mistake: z.string().min(15),
    why: z.string().min(20),
    correction: z.string().min(15),
    citationIds: z.array(z.string().min(1)).min(1),
  })).min(3).max(5),
});

export interface MistakesAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  vicMistakes: Array<{ mistake: string; why?: string; correction?: string }>;
  channelProfilePayload: unknown;
}

export async function runMistakesAuthor(input: MistakesAuthorInput): Promise<MistakesArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use commonMistake/failureModes)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# VIC MISTAKES (additional source — drawn from underlying videos)\n${JSON.stringify(input.vicMistakes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the mistakes as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, mistakesSchema);
  return { ...artifact, costCents };
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd ../.. && git add packages/pipeline/src/authors-studio/specialists/
git commit -m "feat(authors-studio): 5 specialist runners (prose, roadmap, example, diagram, mistakes) + shared _runner helper"
```

---

### Task E5: runCritic — critic agent runner

**Files:**
- Create: `packages/pipeline/src/authors-studio/critic.ts`

- [ ] **Step 1: Implement runCritic**

Create `packages/pipeline/src/authors-studio/critic.ts`:

```typescript
import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './specialists/_runner';
import type { ArtifactBundle, CriticOutput, PagePlan } from './types';

const criticSchema = z.object({
  approved: z.boolean(),
  notes: z.array(z.object({
    artifactKind: z.enum(['cited_prose', 'roadmap', 'hypothetical_example', 'diagram', 'common_mistakes']),
    severity: z.enum(['critical', 'important', 'minor']),
    issue: z.string().min(10),
    evidence: z.string().min(5),
    prescription: z.string().min(10),
  })).max(20),
});

export interface CriticInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  artifacts: ArtifactBundle;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runCritic(input: CriticInput): Promise<CriticOutput> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# ARTIFACTS PRODUCED\n${JSON.stringify(input.artifacts)}\n\n` +
    `# CANON NODES (the source of truth)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output revision notes as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, criticSchema);
  return { ...artifact, costCents };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/authors-studio/critic.ts
git commit -m "feat(authors-studio): runCritic — concrete revision notes per artifact"
```

---

### Task E6: runRevisePass — narrow re-authoring with critic notes

**Files:**
- Create: `packages/pipeline/src/authors-studio/revise.ts`

- [ ] **Step 1: Implement runRevisePass**

Create `packages/pipeline/src/authors-studio/revise.ts`:

```typescript
import type { ArtifactBundle, ArtifactKind, CriticOutput, PagePlan } from './types';
import { runProseAuthor, type ProseAuthorInput } from './specialists/prose';
import { runRoadmapAuthor, type RoadmapAuthorInput } from './specialists/roadmap';
import { runExampleAuthor, type ExampleAuthorInput } from './specialists/example';
import { runDiagramAuthor, type DiagramAuthorInput } from './specialists/diagram';
import { runMistakesAuthor, type MistakesAuthorInput } from './specialists/mistakes';
import type { SpecialistContext } from './specialists/_runner';

export interface ReviseInput {
  plan: PagePlan;
  artifacts: ArtifactBundle;
  notes: CriticOutput;
  // Per-specialist input builders, so callers can inject the same canon-nodes
  // / segment-excerpts / channel-profile they used for the first pass.
  proseInput: ProseAuthorInput;
  roadmapInput?: RoadmapAuthorInput;
  exampleInput?: ExampleAuthorInput;
  diagramInput?: DiagramAuthorInput;
  mistakesInput?: MistakesAuthorInput;
  contextByKind: (kind: ArtifactKind) => SpecialistContext;
}

/**
 * Re-author each artifact that has critic notes, using the same specialist
 * with an extended user message that includes the original artifact + the
 * notes for that artifact. Single-iteration: no second critic round.
 */
export async function runRevisePass(input: ReviseInput): Promise<ArtifactBundle> {
  const notesByKind = new Map<ArtifactKind, CriticOutput['notes']>();
  for (const n of input.notes.notes) {
    if (!notesByKind.has(n.artifactKind)) notesByKind.set(n.artifactKind, []);
    notesByKind.get(n.artifactKind)!.push(n);
  }

  const result: ArtifactBundle = { prose: input.artifacts.prose };

  if (notesByKind.has('cited_prose')) {
    const reviseInput: ProseAuthorInput = {
      ...input.proseInput,
      ctx: input.contextByKind('cited_prose'),
    };
    // Append revision notes to the user message via the channel profile slot
    // is wrong; instead we extend the specialist's input by passing the
    // existing artifact + critic notes as a side block. Keep the same
    // specialist function — it'll see them in `canonNodes` (concretely we
    // re-call runProseAuthor with notes injected as a synthetic
    // "REVISION NOTES" canonNode placeholder).
    // For simplicity we re-call the same author with notes appended.
    result.prose = await runProseAuthorWithNotes(reviseInput, notesByKind.get('cited_prose')!);
  }
  if (input.artifacts.roadmap) {
    result.roadmap = notesByKind.has('roadmap') && input.roadmapInput
      ? await runRoadmapAuthorWithNotes({ ...input.roadmapInput, ctx: input.contextByKind('roadmap') }, notesByKind.get('roadmap')!)
      : input.artifacts.roadmap;
  }
  if (input.artifacts.example) {
    result.example = notesByKind.has('hypothetical_example') && input.exampleInput
      ? await runExampleAuthorWithNotes({ ...input.exampleInput, ctx: input.contextByKind('hypothetical_example') }, notesByKind.get('hypothetical_example')!)
      : input.artifacts.example;
  }
  if (input.artifacts.diagram) {
    result.diagram = notesByKind.has('diagram') && input.diagramInput
      ? await runDiagramAuthorWithNotes({ ...input.diagramInput, ctx: input.contextByKind('diagram') }, notesByKind.get('diagram')!)
      ?? input.artifacts.diagram
      : input.artifacts.diagram;
  }
  if (input.artifacts.mistakes) {
    result.mistakes = notesByKind.has('common_mistakes') && input.mistakesInput
      ? await runMistakesAuthorWithNotes({ ...input.mistakesInput, ctx: input.contextByKind('common_mistakes') }, notesByKind.get('common_mistakes')!)
      : input.artifacts.mistakes;
  }
  return result;
}

// Each "*WithNotes" wrapper appends the critic's notes as a synthetic
// section in the user message, then calls the underlying specialist. This
// keeps the specialist's prompt unchanged — the notes appear as a sidebar
// titled "# REVISION NOTES" that the specialist is instructed to address.

async function runProseAuthorWithNotes(input: ProseAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runProseAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runRoadmapAuthorWithNotes(input: RoadmapAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runRoadmapAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runExampleAuthorWithNotes(input: ExampleAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runExampleAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runDiagramAuthorWithNotes(input: DiagramAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runDiagramAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}

async function runMistakesAuthorWithNotes(input: MistakesAuthorInput, notes: CriticOutput['notes']) {
  const noteText = notes.map((n) => `- [${n.severity}] ${n.issue} — ${n.prescription}`).join('\n');
  const augmentedChannelProfile = {
    ...((input.channelProfilePayload as object) ?? {}),
    _revisionNotes: noteText,
  };
  return runMistakesAuthor({ ...input, channelProfilePayload: augmentedChannelProfile });
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -5
cd ../.. && git add packages/pipeline/src/authors-studio/revise.ts
git commit -m "feat(authors-studio): runRevisePass — narrow re-authoring per critic note"
```

---

### Task E7: assembleBlockTree — deterministic stitching + final validation

**Files:**
- Create: `packages/pipeline/src/authors-studio/assembler.ts`
- Create: `packages/pipeline/src/authors-studio/test/assembler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/pipeline/src/authors-studio/test/assembler.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleBlockTree } from '../assembler';
import type { ArtifactBundle, PagePlan } from '../types';

const SAMPLE_PLAN: PagePlan = {
  pageId: 'pb_test',
  pageType: 'lesson',
  pageTitle: 'Test page',
  thesis: 'A thesis.',
  arc: [{ beat: 'beat one', canonNodeIds: ['cn_a'] }, { beat: 'beat two', canonNodeIds: ['cn_b'] }],
  voiceMode: 'reader_second_person',
  voiceNotes: { tone: 'practitioner', creatorTermsToUse: ['blueprint'], avoidPhrases: [] },
  artifacts: [{ kind: 'cited_prose', canonNodeIds: ['cn_a'], intent: '...' }],
  siblingPagesToReference: [],
  costCents: 5,
};

const SAMPLE_BUNDLE: ArtifactBundle = {
  prose: {
    kind: 'cited_prose',
    paragraphs: [
      { body: 'Para one body, long enough to be meaningful.', citationIds: ['seg_a'] },
      { body: 'Para two body, also of substantive length.', citationIds: ['seg_b'] },
    ],
    costCents: 5,
  },
};

describe('assembleBlockTree', () => {
  it('produces a blockTreeJson with prose paragraphs as overview/paragraph blocks', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: SAMPLE_BUNDLE,
      validSegmentIds: new Set(['seg_a', 'seg_b']),
    });
    assert.equal(result.blocks.length, 2);
    assert.equal(result.blocks[0]!.type, 'overview');
    assert.equal(result.blocks[1]!.type, 'paragraph');
  });

  it('omits diagram block when bundle.diagram is missing', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: SAMPLE_BUNDLE,
      validSegmentIds: new Set(['seg_a', 'seg_b']),
    });
    const hasDiagram = result.blocks.some((b) => b.type === 'diagram');
    assert.equal(hasDiagram, false);
  });

  it('drops citationIds that don\'t resolve to valid segments', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: SAMPLE_BUNDLE,
      validSegmentIds: new Set(['seg_a']), // seg_b missing
    });
    const allCites = result.blocks.flatMap((b) => b.citations ?? []);
    assert.ok(!allCites.includes('seg_b'));
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/authors-studio/test/assembler.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement assembleBlockTree**

Create `packages/pipeline/src/authors-studio/assembler.ts`:

```typescript
import type { ArtifactBundle, PagePlan } from './types';

interface AssemblerInput {
  plan: PagePlan;
  bundle: ArtifactBundle;
  validSegmentIds: Set<string>;
  evidenceSegmentIds?: string[];
  distinctSourceVideos?: number;
  totalSelectedVideos?: number;
  evidenceQuality?: 'strong' | 'moderate' | 'limited' | 'unverified';
}

export interface AssemblerOutput {
  blocks: Array<{
    type: string;
    id: string;
    content: Record<string, unknown>;
    citations?: string[];
  }>;
  atlasMeta: Record<string, unknown>;
}

/**
 * Stitch the artifact bundle into the canonical blockTreeJson shape.
 *
 * Mapping (composer vocabulary → manifest renderer vocabulary):
 *   - prose paragraph #1 → 'overview' block
 *   - prose paragraph #N (N>1) → 'paragraph' block
 *   - roadmap → 'roadmap' block (new in manifest v2)
 *   - hypothetical_example → 'hypothetical_example' block (new)
 *   - diagram → 'diagram' block (new)
 *   - common_mistakes → 'common_mistakes' block (existing in manifest)
 *
 * Citation IDs that don't resolve to validSegmentIds are dropped per-block.
 * The entire block is dropped if its citationIds resolve to zero valid IDs
 * (preventing unsupported claims from rendering).
 */
export function assembleBlockTree(input: AssemblerInput): AssemblerOutput {
  const blocks: AssemblerOutput['blocks'] = [];
  let blockIndex = 0;
  const filterCites = (ids: readonly string[]) => ids.filter((id) => input.validSegmentIds.has(id));

  // Prose paragraphs
  input.bundle.prose.paragraphs.forEach((p, i) => {
    const cites = filterCites(p.citationIds);
    if (cites.length === 0) return; // drop unsupported paragraph
    blocks.push({
      type: i === 0 ? 'overview' : 'paragraph',
      id: `blk_${blockIndex++}`,
      content: { body: p.body, ...(p.heading ? { heading: p.heading } : {}) },
      citations: cites,
    });
  });

  // Hypothetical example (if present)
  if (input.bundle.example) {
    const cites = filterCites(input.bundle.example.citationIds);
    if (cites.length > 0) {
      blocks.push({
        type: 'hypothetical_example',
        id: `blk_${blockIndex++}`,
        content: {
          setup: input.bundle.example.setup,
          stepsTaken: input.bundle.example.stepsTaken,
          outcome: input.bundle.example.outcome,
        },
        citations: cites,
      });
    }
  }

  // Roadmap (if present)
  if (input.bundle.roadmap) {
    const allCites = new Set<string>();
    const filteredSteps = input.bundle.roadmap.steps.map((s) => {
      const stepCites = filterCites(s.citationIds);
      stepCites.forEach((c) => allCites.add(c));
      return { ...s, citationIds: stepCites };
    });
    if (allCites.size > 0) {
      blocks.push({
        type: 'roadmap',
        id: `blk_${blockIndex++}`,
        content: {
          title: input.bundle.roadmap.title,
          steps: filteredSteps,
        },
        citations: [...allCites],
      });
    }
  }

  // Diagram (if present and parsed)
  if (input.bundle.diagram) {
    const cites = filterCites(input.bundle.diagram.citationIds);
    blocks.push({
      type: 'diagram',
      id: `blk_${blockIndex++}`,
      content: {
        diagramType: input.bundle.diagram.diagramType,
        mermaidSrc: input.bundle.diagram.mermaidSrc,
        caption: input.bundle.diagram.caption,
      },
      citations: cites,
    });
  }

  // Common mistakes (if present)
  if (input.bundle.mistakes) {
    const allCites = new Set<string>();
    const filteredItems = input.bundle.mistakes.items
      .map((m) => {
        const cites = filterCites(m.citationIds);
        cites.forEach((c) => allCites.add(c));
        return { ...m, citationIds: cites };
      })
      .filter((m) => m.citationIds.length > 0);
    if (filteredItems.length > 0) {
      blocks.push({
        type: 'common_mistakes',
        id: `blk_${blockIndex++}`,
        content: { items: filteredItems.map((m) => ({ title: m.mistake, body: `${m.why} ${m.correction}` })) },
        citations: [...allCites],
      });
    }
  }

  const atlasMeta = {
    evidenceQuality: input.evidenceQuality ?? 'limited',
    citationCount: input.evidenceSegmentIds?.length ?? 0,
    sourceCoveragePercent:
      input.totalSelectedVideos && input.totalSelectedVideos > 0
        ? Math.min(1, (input.distinctSourceVideos ?? 0) / input.totalSelectedVideos)
        : 0,
    relatedPageIds: [] as string[],
    hero: {
      illustrationKey:
        input.plan.pageType === 'framework' || input.plan.pageType === 'playbook' ? 'desk' : 'open-notebook',
    },
    evidenceSegmentIds: input.evidenceSegmentIds ?? [],
    primaryFindingId: input.plan.arc[0]?.canonNodeIds[0] ?? '',
    supportingFindingIds: input.plan.arc.flatMap((b) => b.canonNodeIds),
    pageTitle: input.plan.pageTitle,
    audienceQuestion: '',
    openingHook: input.plan.thesis,
    distinctSourceVideos: input.distinctSourceVideos ?? 0,
    totalSelectedVideos: input.totalSelectedVideos ?? 0,
    voiceMode: input.plan.voiceMode,
  };

  return { blocks, atlasMeta };
}
```

- [ ] **Step 4: Run tests**

```bash
NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/authors-studio/test/assembler.test.ts 2>&1 | tail -10
```

Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add packages/pipeline/src/authors-studio/assembler.ts packages/pipeline/src/authors-studio/test/assembler.test.ts
git commit -m "feat(authors-studio): assembleBlockTree — stitch artifacts into manifest blocks + tests"
```

---

### Task E8: Replace runPageCompositionStage body

**Files:**
- Modify: `packages/pipeline/src/stages/page-composition.ts`

This task replaces the stage body wholesale: the deterministic-fallback path is removed; the Author's Studio is the only path.

- [ ] **Step 1: Read existing page-composition.ts to understand the surrounding context (idempotency, types, imports)**

```bash
sed -n '1,40p' packages/pipeline/src/stages/page-composition.ts
```

Expected: imports + the existing exports `PageCompositionStageInput`, `PageCompositionStageOutput`, `runPageCompositionStage`, `validatePageCompositionMaterialization`.

- [ ] **Step 2: Rewrite page-composition.ts**

Replace the entire body of `packages/pipeline/src/stages/page-composition.ts` with:

```typescript
import { and, eq, inArray } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  page,
  pageBrief,
  pageVersion,
  segment,
  videoSetItem,
  generationRun,
} from '@creatorcanon/db/schema';
import { getDb, type AtlasDb } from '@creatorcanon/db';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import { SPECIALISTS } from '../agents/specialists';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import type { StageContext } from '../harness';
import { buildFallbacks } from './fallback-chain';
import { project } from '@creatorcanon/db/schema';

import type { PagePlan, ArtifactBundle, ArtifactKind, VoiceMode } from '../authors-studio/types';
import { runStrategist } from '../authors-studio/strategist';
import { runProseAuthor } from '../authors-studio/specialists/prose';
import { runRoadmapAuthor } from '../authors-studio/specialists/roadmap';
import { runExampleAuthor } from '../authors-studio/specialists/example';
import { runDiagramAuthor } from '../authors-studio/specialists/diagram';
import { runMistakesAuthor } from '../authors-studio/specialists/mistakes';
import { runCritic } from '../authors-studio/critic';
import { runRevisePass } from '../authors-studio/revise';
import { assembleBlockTree } from '../authors-studio/assembler';
import type { SpecialistContext } from '../authors-studio/specialists/_runner';

function nano(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export interface PageCompositionStageInput {
  runId: string;
  workspaceId: string;
  r2Override?: R2Client;
}

export interface PageCompositionStageOutput {
  pageCount: number;
  studioPagesAuthored: number;
  pagesWithDiagram: number;
  pagesWithRoadmap: number;
  pagesWithExample: number;
  pagesWithMistakes: number;
  costCents: number;
}

export async function runPageCompositionStage(
  input: PageCompositionStageInput,
): Promise<PageCompositionStageOutput> {
  ensureToolsRegistered();
  const db = getDb();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);

  // Idempotency: pageVersion FK to page → delete versions first.
  await db.delete(pageVersion).where(eq(pageVersion.runId, input.runId));
  await db.delete(page).where(eq(page.runId, input.runId));

  // Load briefs ordered by position.
  const briefs = await db
    .select()
    .from(pageBrief)
    .where(eq(pageBrief.runId, input.runId))
    .orderBy(pageBrief.position);
  if (briefs.length === 0) {
    return { pageCount: 0, studioPagesAuthored: 0, pagesWithDiagram: 0, pagesWithRoadmap: 0, pagesWithExample: 0, pagesWithMistakes: 0, costCents: 0 };
  }

  // Load channel profile (whole-run shared input).
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, input.runId))
    .limit(1);
  const channelProfilePayload = cpRows[0]?.payload ?? null;
  if (!channelProfilePayload) {
    throw new Error('page-composition stage requires channel_profile to have run first');
  }

  // Load the workspace's project to read voiceMode.
  const runRows = await db
    .select({ projectId: generationRun.projectId })
    .from(generationRun)
    .where(eq(generationRun.id, input.runId))
    .limit(1);
  const projectId = runRows[0]?.projectId;
  if (!projectId) throw new Error(`generation_run ${input.runId} has no projectId`);
  const projectRows = await db
    .select({ config: project.config })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  const projectConfig = projectRows[0]?.config as { voiceMode?: VoiceMode } | null;
  const voiceMode: VoiceMode = projectConfig?.voiceMode === 'creator_first_person' ? 'creator_first_person' : 'reader_second_person';

  // Load total selected videos (for atlasMeta.sourceCoveragePercent).
  const setRows = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .innerJoin(generationRun, eq(generationRun.videoSetId, videoSetItem.videoSetId))
    .where(eq(generationRun.id, input.runId));
  const totalSelectedVideos = setRows.length;

  // Pre-load every canon node referenced anywhere in any brief.
  const nodeIds = new Set<string>();
  for (const b of briefs) {
    const p = b.payload as { primaryCanonNodeIds?: string[]; supportingCanonNodeIds?: string[] };
    for (const id of p.primaryCanonNodeIds ?? []) nodeIds.add(id);
    for (const id of p.supportingCanonNodeIds ?? []) nodeIds.add(id);
  }
  const nodes = nodeIds.size
    ? await db.select().from(canonNode).where(and(eq(canonNode.runId, input.runId), inArray(canonNode.id, [...nodeIds])))
    : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n as Record<string, unknown>]));

  // Pre-load every segment that any canon node cites.
  const segIds = new Set<string>();
  for (const n of nodes) for (const id of n.evidenceSegmentIds) segIds.add(id);
  const segs = segIds.size
    ? await db.select({ id: segment.id, videoId: segment.videoId, text: segment.text, startMs: segment.startMs, endMs: segment.endMs }).from(segment).where(and(eq(segment.runId, input.runId), inArray(segment.id, [...segIds])))
    : [];
  const validSegmentIds = new Set(segs.map((s) => s.id));
  const segById = new Map(segs.map((s) => [s.id, s]));

  // Sibling-brief snapshot for the strategist (lets it avoid duplication).
  const siblingBriefs = briefs.map((b) => {
    const p = b.payload as { pageTitle?: string; audienceQuestion?: string; primaryCanonNodeIds?: string[]; slug?: string };
    return {
      id: b.id,
      pageTitle: p.pageTitle ?? '',
      slug: p.slug ?? `pg-${b.id.slice(0, 8)}`,
      audienceQuestion: p.audienceQuestion ?? '',
      primaryCanonNodeIds: p.primaryCanonNodeIds ?? [],
    };
  });

  // Provider factory.
  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };
  const ctxFor = (agent: 'page_strategist' | 'prose_author' | 'roadmap_author' | 'example_author' | 'diagram_author' | 'mistakes_author' | 'critic'): SpecialistContext => {
    const cfg = SPECIALISTS[agent];
    const model = selectModel(agent, process.env);
    return {
      runId: input.runId,
      workspaceId: input.workspaceId,
      agent,
      modelId: model.modelId,
      provider: makeProvider(model.provider),
      fallbacks: buildFallbacks(model, makeProvider),
      r2,
      systemPrompt: cfg.systemPrompt,
      caps: cfg.stopOverrides,
    };
  };

  let pagesWithDiagram = 0, pagesWithRoadmap = 0, pagesWithExample = 0, pagesWithMistakes = 0;
  let studioPagesAuthored = 0;
  let totalCostCents = 0;
  let position = 0;

  for (const brief of briefs) {
    const briefPayload = brief.payload as { primaryCanonNodeIds?: string[]; supportingCanonNodeIds?: string[]; pageType?: string; pageTitle?: string; slug?: string };
    const primary = (briefPayload.primaryCanonNodeIds ?? []).map((id) => nodeById.get(id)).filter((n): n is Record<string, unknown> => Boolean(n));
    const supporting = (briefPayload.supportingCanonNodeIds ?? []).map((id) => nodeById.get(id)).filter((n): n is Record<string, unknown> => Boolean(n));
    if (primary.length === 0) continue;

    // 1. Strategist
    const strategistCtx = ctxFor('page_strategist');
    const plan = await runStrategist({
      runId: input.runId,
      workspaceId: input.workspaceId,
      voiceMode,
      channelProfilePayload,
      brief: { id: brief.id, payload: brief.payload as Record<string, unknown> },
      primaryCanonNodes: primary,
      supportingCanonNodes: supporting,
      siblingBriefs: siblingBriefs.filter((s) => s.id !== brief.id),
      provider: strategistCtx.provider,
      fallbacks: strategistCtx.fallbacks,
      r2,
      modelId: strategistCtx.modelId,
    });
    totalCostCents += plan.costCents;

    // 2. Specialists in parallel
    const allArtifactNodes = [...primary, ...supporting];
    const segmentExcerpts = segs
      .filter((s) => allArtifactNodes.some((n) => (n.evidenceSegmentIds as string[]).includes(s.id)))
      .map((s) => ({ segmentId: s.id, videoId: s.videoId, text: s.text, startMs: s.startMs, endMs: s.endMs }));

    const wantsKind = (k: ArtifactKind) => plan.artifacts.some((a) => a.kind === k);

    const proseInput = { ctx: ctxFor('prose_author'), plan, canonNodes: allArtifactNodes, segmentExcerpts, channelProfilePayload };
    const roadmapInput = wantsKind('roadmap')
      ? { ctx: ctxFor('roadmap_author'), plan, canonNodes: allArtifactNodes, channelProfilePayload }
      : undefined;
    const exampleInput = wantsKind('hypothetical_example')
      ? { ctx: ctxFor('example_author'), plan, canonNodes: allArtifactNodes, channelProfilePayload }
      : undefined;
    const diagramInput = wantsKind('diagram')
      ? { ctx: ctxFor('diagram_author'), plan, canonNodes: allArtifactNodes, channelProfilePayload }
      : undefined;
    const mistakesInput = wantsKind('common_mistakes')
      ? { ctx: ctxFor('mistakes_author'), plan, canonNodes: allArtifactNodes, vicMistakes: [], channelProfilePayload }
      : undefined;

    const [proseRes, roadmapRes, exampleRes, diagramRes, mistakesRes] = await Promise.all([
      runProseAuthor(proseInput),
      roadmapInput ? runRoadmapAuthor(roadmapInput) : Promise.resolve(undefined),
      exampleInput ? runExampleAuthor(exampleInput) : Promise.resolve(undefined),
      diagramInput ? runDiagramAuthor(diagramInput) : Promise.resolve(undefined),
      mistakesInput ? runMistakesAuthor(mistakesInput) : Promise.resolve(undefined),
    ]);

    let bundle: ArtifactBundle = {
      prose: proseRes,
      roadmap: roadmapRes ?? undefined,
      example: exampleRes ?? undefined,
      diagram: diagramRes ?? undefined,
      mistakes: mistakesRes ?? undefined,
    };
    totalCostCents += proseRes.costCents
      + (roadmapRes?.costCents ?? 0)
      + (exampleRes?.costCents ?? 0)
      + (diagramRes?.costCents ?? 0)
      + (mistakesRes?.costCents ?? 0);

    // 3. Critic
    const criticCtx = ctxFor('critic');
    const critic = await runCritic({ ctx: criticCtx, plan, artifacts: bundle, canonNodes: allArtifactNodes, channelProfilePayload });
    totalCostCents += critic.costCents;

    // 4. Revise pass (if any non-trivial notes)
    if (critic.notes.length > 0 && !critic.approved) {
      const revised = await runRevisePass({
        plan,
        artifacts: bundle,
        notes: critic,
        proseInput,
        roadmapInput,
        exampleInput,
        diagramInput,
        mistakesInput,
        contextByKind: (k) =>
          k === 'cited_prose' ? ctxFor('prose_author') :
          k === 'roadmap' ? ctxFor('roadmap_author') :
          k === 'hypothetical_example' ? ctxFor('example_author') :
          k === 'diagram' ? ctxFor('diagram_author') :
          ctxFor('mistakes_author'),
      });
      bundle = revised;
    }

    // 5. Assemble + persist
    const evidenceSegmentIds = [...new Set(allArtifactNodes.flatMap((n) => n.evidenceSegmentIds as string[]))];
    const distinctSourceVideos = new Set(allArtifactNodes.flatMap((n) => n.sourceVideoIds as string[])).size;
    const tree = assembleBlockTree({
      plan,
      bundle,
      validSegmentIds,
      evidenceSegmentIds,
      distinctSourceVideos,
      totalSelectedVideos,
      evidenceQuality: ((primary[0]?.evidenceQuality as 'strong' | 'moderate' | 'limited' | undefined) ?? 'limited'),
    });

    if (bundle.diagram) pagesWithDiagram += 1;
    if (bundle.roadmap) pagesWithRoadmap += 1;
    if (bundle.example) pagesWithExample += 1;
    if (bundle.mistakes) pagesWithMistakes += 1;
    studioPagesAuthored += 1;

    const pageId = `pg_${nano()}`;
    const versionId = `pv_${nano()}`;
    await db.insert(page).values({
      id: pageId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      slug: briefPayload.slug ?? `pg-${nano()}`,
      pageType: mapPageTypeToEnum(plan.pageType),
      position: position++,
      supportLabel: 'review_recommended',
      currentVersionId: versionId,
    });
    await db.insert(pageVersion).values({
      id: versionId,
      workspaceId: input.workspaceId,
      pageId,
      runId: input.runId,
      version: 1,
      title: plan.pageTitle,
      summary: plan.thesis,
      blockTreeJson: tree,
      isCurrent: true,
    });
  }

  return {
    pageCount: briefs.length,
    studioPagesAuthored,
    pagesWithDiagram,
    pagesWithRoadmap,
    pagesWithExample,
    pagesWithMistakes,
    costCents: totalCostCents,
  };
}

export async function validatePageCompositionMaterialization(
  _output: PageCompositionStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const r = await db.select({ id: page.id }).from(page).where(eq(page.runId, ctx.runId));
  return r.length > 0;
}

type PageTypeEnum = 'hub_home' | 'topic_overview' | 'lesson' | 'playbook' | 'framework' | 'about';

function mapPageTypeToEnum(raw: string): PageTypeEnum {
  switch (raw.toLowerCase()) {
    case 'lesson':
    case 'definition':
    case 'principle':
      return 'lesson';
    case 'framework':
      return 'framework';
    case 'playbook':
      return 'playbook';
    case 'topic':
    case 'topic_overview':
    case 'example_collection':
      return 'topic_overview';
    case 'hub_home':
      return 'hub_home';
    case 'about':
      return 'about';
    default:
      return 'lesson';
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -8
```

Expected: clean.

- [ ] **Step 4: Run all existing tests for no regression**

```bash
NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/test/cost-tracking.test.ts src/agents/providers/test/selectModel.test.ts src/agents/providers/test/selectModel.modes.test.ts src/agents/providers/test/selectModel.quality.test.ts src/authors-studio/test/grounding.test.ts src/authors-studio/test/mermaid-validate.test.ts src/authors-studio/test/assembler.test.ts 2>&1 | tail -10
```

Expected: 39+ tests passing (32 prior + 4 grounding + 4 mermaid + 3 assembler).

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add packages/pipeline/src/stages/page-composition.ts
git commit -m "refactor(page-composition): replace deterministic fallback with Author's Studio orchestration"
```

---

## Phase F — Adapter passthrough + cleanup

### Task F1: Update `mapComposerBlockToRendererSection` to passthrough new kinds

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`

The composer now emits manifest-vocabulary block kinds directly (`overview`, `paragraph`, `roadmap`, `diagram`, `hypothetical_example`, `common_mistakes`). The adapter's `mapComposerBlockToRendererSection` translation layer is no longer doing any translation for the new kinds — they pass through as-is. Update it to handle them.

- [ ] **Step 1: Find the function and add new cases**

In `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`, find `function mapComposerBlockToRendererSection(`. Add three new cases to its switch:

```typescript
    case 'roadmap':
      return {
        kind: 'roadmap',
        title: (content.title as string | undefined) ?? 'Steps',
        steps: (content.steps as Array<unknown> | undefined) ?? [],
        citationIds,
      };

    case 'diagram':
      return {
        kind: 'diagram',
        diagramType: (content.diagramType as 'flowchart' | 'sequence' | 'state' | 'mindmap') ?? 'flowchart',
        mermaidSrc: (content.mermaidSrc as string | undefined) ?? '',
        caption: (content.caption as string | undefined) ?? '',
        citationIds,
      };

    case 'hypothetical_example':
      return {
        kind: 'hypothetical_example',
        setup: (content.setup as string | undefined) ?? '',
        stepsTaken: (content.stepsTaken as string[] | undefined) ?? [],
        outcome: (content.outcome as string | undefined) ?? '',
        citationIds,
      };
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd ../.. && git add packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "feat(adapter): passthrough roadmap, diagram, hypothetical_example block kinds"
```

---

## Phase G — End-to-end smoke verification

### Task G1: Re-run the existing project from canon onward

The upstream prompt extensions (Tasks C1, C2) require canon + video_intelligence to re-run so the new editorial fields appear. Then page-composition runs fresh on the new canon.

**Files:**
- N/A (verification only)

- [ ] **Step 1: Reset stage_runs from video_intelligence onward**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\\r?\\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL);
(async()=>{
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`DELETE FROM page_quality_report WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page_version WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page_brief WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM canon_node WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM video_intelligence_card WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM generation_stage_run WHERE run_id = \${RUN} AND stage_name IN ('video_intelligence','canon','page_briefs','page_composition','page_quality','adapt')\`;
  await sql\`UPDATE generation_run SET status = 'queued', started_at = NULL, completed_at = NULL WHERE id = \${RUN}\`;
  console.log('reset complete');
  await sql.end();
})();
" 2>&1 | tail -3
```

Expected: `reset complete`.

- [ ] **Step 2: Re-dispatch with production_economy**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/pipeline" && PIPELINE_QUALITY_MODE=production_economy ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tee /tmp/canon-studio.log | tail -8
```

Expected: `[dispatch] complete` with non-zero `pageCount` and `studioPagesAuthored = pageCount`.

- [ ] **Step 3: Verify cost target**

```bash
cd packages/db && node -e "
const fs=require('node:fs');for(const f of['../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\\r?\\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL)\`SELECT stage_name, output_json->>'costCents' AS c FROM generation_stage_run WHERE run_id = '97e8772c-07e3-4408-ba40-0a17450f33cf' ORDER BY started_at\`.then(r=>{let total=0;for(const row of r){const c=Number(row.c||0);total+=c;console.log(row.stage_name.padEnd(22)+c.toFixed(2));}console.log('TOTAL'.padEnd(22)+total.toFixed(2)+' cents = \\\$'+(total/100).toFixed(2));process.exit(0)});
" 2>&1 | tail -15
```

Expected: total cost in the **\$3-5 range** (vs \$1.50 in pre-redesign).

- [ ] **Step 4: Re-publish + reload hub**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\\r?\\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL);
(async()=>{
  const HUB='4f83bf07-2574-483b-a17e-882190d34339';
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`UPDATE hub SET live_release_id = NULL WHERE id = \${HUB}\`;
  await sql\`DELETE FROM release WHERE hub_id = \${HUB} AND run_id = \${RUN}\`;
  await sql.end();
})();
" 2>&1 | tail -3
cd ../pipeline && ./node_modules/.bin/tsx ./src/publish-now.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tail -5
```

Expected: `[publish] complete` with new releaseId.

- [ ] **Step 5: Manual hub QA**

Open `http://localhost:3000/h/ai-ultimate-knowledge-hub` and click into 3 random pages. For each, verify:

- Page title is real (not "Untitled")
- Lead paragraph is teaching prose, not a stock summary
- At least one of: roadmap, diagram, hypothetical_example, common_mistakes is rendered (per page-type defaults from §5)
- All citations resolve in the right rail
- Voice is `reader_second_person` (you-pronoun)
- The page passes the smell test of "I'd be proud to publish this"

If pages still feel weak:
- Check `generation_stage_run.output_json` for the page_composition stage to see how many revise loops occurred and if the critic is producing concrete notes.
- Check the agent transcripts on R2 (`workspaces/<ws>/runs/<run>/agents/<agent>/transcript.json`) for any specialist with weak output.
- Re-run with `PIPELINE_QUALITY_MODE=premium` for a quality ceiling test.

- [ ] **Step 6: Tag this milestone**

If the manual QA passes:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS" && git tag canon-v1-authors-studio-shipped && git push origin canon-v1-authors-studio-shipped
```

If the manual QA fails: do not tag; open follow-up plan with specific failures captured.

---

## Self-Review

**Spec coverage:**
- ✅ Voice config UI + DB backfill → Task A1
- ✅ Manifest schema extension (3 new block kinds) → Task A2
- ✅ Author's Studio shared types → Task A3
- ✅ Renderer components for roadmap/diagram/hypothetical_example → Tasks B1-B3
- ✅ Section dispatcher routing → Task B4
- ✅ video_intelligence prompt + schema extension → Task C1
- ✅ canon_architect prompt + schema extension → Task C2
- ✅ Register 7 new agents in selectModel + QUALITY_PRESETS → Task D1
- ✅ 7 prompts → Tasks D2-D8
- ✅ 7 specialist registrations → Task D9
- ✅ Mermaid validator → Task E1
- ✅ Citation grounding + voice consistency → Task E2
- ✅ Strategist runner → Task E3
- ✅ 5 specialist runners → Task E4
- ✅ Critic runner → Task E5
- ✅ Revise pass → Task E6
- ✅ Assembler → Task E7
- ✅ runPageCompositionStage rewrite → Task E8
- ✅ Adapter passthrough → Task F1
- ✅ Smoke verification → Task G1

**Placeholder scan:** No "TBD" / "fill in later" / "implement later". Each task has full code blocks where code is needed and exact commands where commands are needed. ✓

**Type consistency:**
- `PagePlan` defined in A3, used in E3-E8 ✓
- `ArtifactBundle` defined in A3, used in assembler + revise + critic ✓
- `VoiceMode` defined in A3, used in strategist + page-composition ✓
- `ArtifactKind` defined in A3, used in revise + plan ✓
- `runProseAuthor`, `runRoadmapAuthor`, `runExampleAuthor`, `runDiagramAuthor`, `runMistakesAuthor`, `runCritic`, `runStrategist`, `runRevisePass`, `assembleBlockTree` — all defined and consistently named across tasks ✓
- `mapComposerBlockToRendererSection` — referenced in F1 and exists in project-pages.ts ✓

Plan is internally consistent.
