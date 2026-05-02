# Phase B — Creator Editor UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Inline editor on every hub page so the creator can review/edit/regenerate any block (action plan step, worksheet field, calculator interpretation, canon body, brief, etc.) before publishing — without losing work.

**Architecture:** React-based block-level editor that mounts on top of the rendered hub. Each editable block emits change events to a shared `EditorContext`. Changes persist locally (IndexedDB) until creator clicks "Save & Republish," which posts the diff to the synthesis run + triggers a targeted regeneration of just the changed block.

**Owner:** Codex (frontend — Next.js + React + IndexedDB).

**Dependencies:** Phase A (product bundle exists) for live data; mock data acceptable for weeks 1-7.

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

### B.7 — Testing + commit + PR

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
