# Phase B — Creator Editor UI + AI Builder (Conversational)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Two surfaces for the creator to refine their hub before publishing:
1. **Inline editor** — every hub block (action plan step, worksheet field, calculator interpretation, canon body, brief, etc.) is editable in place, with per-block targeted regeneration.
2. **AI builder** — a conversational sidekick (chat panel attached to every hub) that lets the creator say things like "rewrite the intro in a punchier voice", "delete the calculator and replace it with a checklist", "make the action plan more skeptical-tone", and the builder applies the change as a structured edit. The builder MUST debit `builder_credits` from the creator's Phase N ledger per call.

The builder is positioned as the "natural way" to edit; the inline editor remains for precision tweaks.

**Architecture:**
- **Inline editor:** React block-level editor mounted on top of rendered hub. Each editable block emits change events to a shared `EditorContext`. Changes persist locally (IndexedDB) until creator clicks "Save & Republish," which posts the diff to the synthesis run + triggers a targeted regeneration of just the changed block.
- **AI builder:** chat panel docked to the right rail. Each user message + current hub state is sent to a builder API (Claude-owned). Backend resolves the message into a structured edit operation (typed JSON: `{op: 'rewrite_block', blockId, instruction}` or `{op: 'replace_section', sectionId, newKind, instruction}` or `{op: 'tone_shift', scope, instruction}`). The op is applied to the working draft (still in IndexedDB) + diff highlighted in the live hub. Creator can accept/reject. Each builder call decrements `builder_credits` (Phase N).

**Owner:** Codex (frontend — Next.js + React + IndexedDB) + Claude (AI builder backend: op resolver, typed edit operations, credit ledger integration, content rewrite via Codex CLI).

**Dependencies:** Phase A (product bundle exists) for live data; mock data acceptable for weeks 1-7. Phase N (credit ledger) for builder consumption.

**Estimated weeks:** 6 (weeks 8-14 of the meta-timeline).

---

## File structure

```
apps/web/src/components/editor/
  EditorProvider.tsx               ← context for editor state
  BlockEditor.tsx                  ← generic editable wrapper
  blocks/
    ActionPlanStepEditor.tsx
    WorksheetFieldEditor.tsx
    CalculatorInterpretationEditor.tsx
    DiagnosticQuestionEditor.tsx
    CanonBodyParagraphEditor.tsx
    HeroCopyEditor.tsx
  RegenerateButton.tsx             ← per-block "regenerate" with prompt input
  SaveBar.tsx                      ← floating "Save & Republish" button
  DraftStorage.ts                  ← IndexedDB wrapper
  diff.ts                          ← computes block-level diff for API submission

apps/web/src/app/(creator)/edit/[runId]/
  page.tsx                         ← mounts editor on top of hub
  layout.tsx                       ← editor-mode chrome (review checklist, save bar)

apps/web/src/app/api/runs/[runId]/blocks/[blockId]/regenerate/
  route.ts                         ← POST: regenerate single block via Codex; returns new content

apps/web/src/app/api/runs/[runId]/republish/
  route.ts                         ← POST: persist creator edits + trigger redeploy

apps/web/src/components/builder/                       ← Codex
  BuilderPanel.tsx                                     ← right-rail chat
  BuilderMessage.tsx                                   ← user/assistant message bubble
  EditPreview.tsx                                      ← shows the proposed edit + accept/reject
  BuilderCreditsBadge.tsx                              ← "230 builder credits left"

packages/synthesis/src/builder/                        ← Claude
  builder.ts                                           ← main entrypoint: message → edit op
  op-resolver.ts                                       ← LLM call that maps message + hub state → typed op
  op-applier.ts                                        ← applies typed op to draft (returns diff)
  ops/
    rewrite-block.ts
    replace-section.ts
    tone-shift.ts
    add-block.ts
    remove-block.ts

apps/web/src/app/api/runs/[runId]/builder/
  route.ts                                             ← POST: builder message → returns proposed edit (typed op + diff)
```

---

## Tasks

### B.1 — EditorContext + IndexedDB drafts

Block-level state container. Each block emits `onChange(newContent)`. Changes accumulate in `EditorContext` + auto-save to IndexedDB every 5 seconds. On page reload, draft is restored. Test: edit a block, refresh, edit persists.

### B.2 — Generic BlockEditor wrapper

Wraps any rendered block. Adds an "edit" pencil icon on hover. Click → enters edit mode. ESC cancels. Cmd+S saves locally. Renders `children` in read mode + chosen editor in write mode.

### B.3 — Per-block-type editors (6 specialized editors)

One editor component per block type. Each handles its own validation:
- **Action plan step:** title (8 words max), description (1 sentence), duration (dropdown), success criterion (1 sentence)
- **Worksheet field:** label, type, options, help text
- **Calculator interpretation:** plain text editor with variable autocomplete (`{{monthlyRevenue}}` insertion)
- **Diagnostic question:** question text + options (add/remove/reorder)
- **Canon body paragraph:** Tiptap or Slate-based rich text editor; preserves Phase 11 manual-rewrite API
- **Hero copy:** title, tagline, hub-stat (each is a small `<input>`)

### B.4 — RegenerateButton (per-block targeted regeneration)

Click → modal with instruction input ("tighten the language" / "make this more direct" / etc.). On submit:
- POST `/api/runs/[runId]/blocks/[blockId]/regenerate` with `{instruction, blockType, currentContent}`
- Backend (Claude's Phase 11 manual-rewrite API + extension for new block types) returns rewritten content
- Editor shows new content + "Accept" / "Reject" / "Regenerate again" UI

### B.5 — SaveBar + republish flow

Floating bottom bar shows "N pending changes." Click "Save & Republish":
- Compute diff (IndexedDB drafts vs server state)
- POST `/api/runs/[runId]/republish` with diff
- Backend persists edits to product bundle + triggers redeploy (or rebuild for static hubs)
- Success toast + redirect to live hub

### B.6 — Editor-mode chrome

`apps/web/src/app/(creator)/edit/[runId]/layout.tsx` adds:
- Top bar: "Editing: [creator name] hub"
- Side: review checklist ("12 of 24 blocks reviewed")
- Floating save bar (B.5)

### B.7 — AI Builder backend (Claude)

**`builder.ts`** — entry point: `runBuilder({runId, message, hubState})` returns `{op, diff, costCents}`.

**`op-resolver.ts`** — Codex CLI call (or GPT-4o-mini fallback). Prompt: "Given the user's request and the hub state, return a typed JSON op." Schema-validated output. Examples in prompt for each op kind. On parse failure, retry with stricter schema reminder.

**`op-applier.ts`** — given a typed op + draft, applies the op (calls block rewrite for `rewrite_block`, calls full block replace for `replace_section`, etc.). Returns updated draft + structural diff (block IDs added/removed/modified).

**Each `runBuilder` call**:
1. `requireCredits(userId, 'builder_credits', 1)` (Phase N enforcer)
2. resolve op (1 LLM call)
3. apply op (may include 1+ rewrite calls)
4. on success: `consume('builder_credits', 1, source: 'builder:${runId}:${msgId}')`
5. return op + diff to UI

### B.8 — AI Builder UI (Codex)

`BuilderPanel.tsx`:
- Right-rail panel, toggleable
- Input + send button
- Streamed response: "Working on this..." → "Here's the proposed change:" → renders `EditPreview`
- User clicks Accept (op applied to IndexedDB draft, hub re-renders) or Reject (no-op, refund credits if op generation failed)
- Credits badge showing remaining `builder_credits`

`EditPreview.tsx`:
- Shows the diff inline on the hub (highlighted blocks)
- Accept/Reject buttons
- "Refine" button → opens follow-up message field

### B.9 — Builder + inline editor coordination

When AI builder applies an op, draft state in IndexedDB updates. Inline editor reflects the change automatically (both share `EditorContext`). When inline editor commits a change, builder context (hub state) refreshes for the next builder call.

When creator clicks "Save & Republish," the SaveBar diff (B.5) includes both inline edits + builder-applied edits as a unified diff.

### B.10 — Testing + commit + PR

- Unit tests for `DraftStorage` (IndexedDB mock)
- Integration test: edit a block, save, verify API called with correct diff
- Visual regression test on at least 1 creator's hub
- PR title: "Phase B: creator editor UI (inline editing for all hub blocks)"

---

## Success criteria (exit gate)

- [ ] Editor mounts on Hormozi's hub without breaking read-mode rendering
- [ ] All 6 block types editable + persistable to IndexedDB
- [ ] RegenerateButton successfully calls backend API + applies returned content
- [ ] Save & Republish flow completes end-to-end + triggers redeploy
- [ ] No regression in read-mode performance (Lighthouse parity vs main)

## Risk callouts

- **IndexedDB browser support quirks** — falls back to localStorage on Safari iOS in some modes. Mitigation: feature-detect + graceful degradation message.
- **Regenerate-button latency** — Codex calls take 10-60s. Mitigation: optimistic UI ("regenerating..." spinner) + cancel option.
- **Diff merging when synthesis is re-run while creator is editing** — Mitigation: lock the run's product bundle while creator is in edit mode (advisory lock — don't hard-fail, just warn on save).

## Out of scope (deferred to later phases)

- Real-time collaborative editing (multiple creators editing same hub)
- Comment threads on blocks
- Version history beyond current draft
