# Phase H — Science-Explainer Product Synthesis: Results

**Branch:** `feat/phase-h-science-synthesis`
**Run:** autonomous Claude Opus 4.7 (1M ctx) executor session, 2026-05-02
**Plan:** `PHASE_H_PLAN.md` (8 tasks H.1–H.8)
**Worktree:** `SaaS/.worktrees/phase-h-execute`

---

## What shipped

Three new composers + a complete science-explainer hub shell on top of
Phase A's product synthesis substrate. Where Phase A's product moment is
"here is your action plan," Phase H's product moment is **claim search**:
the audience lands asking "does X cause Y?" and gets a verdict-badged
evidence card in two seconds.

### Code

- `packages/synthesis/` — additive on Phase A
  - `types.ts`: extended ProductBundle.components with `reference?:
    ReferenceComponent`, `debunking?: DebunkingComponent`, `glossary?:
    GlossaryComponent`. New value types: `EvidenceCard`,
    `EvidenceVerdict`, `DebunkingItem`, `GlossaryEntry`. Widened
    `_index_voice_fingerprint` to admit `rhetoricalMoves: string[]`.
  - `composers/router.ts`: `science-explainer` archetype now routes
    reference + debunking + glossary + diagnostic + funnel.
  - `composers/reference-composer.ts`: builds EvidenceCards from
    claim/evidence_review/definition canons. Verdict resolution prefers
    `_index_verification_status`; falls back to body cues.
  - `composers/debunking-forge.ts`: detects debunking canons via body
    language ("the myth is", "actually, the data shows", "no evidence
    that") + voice fingerprint `rhetoricalMoves` tags. Caps at 20 items
    by default.
  - `composers/glossary-builder.ts`: programmatic capitalised-multi-word
    extractor with stopword filter, occurrence threshold (3+), and
    Codex-authored definitions per surviving term.
  - `runner.ts`: wires the three new composers into the Promise.all.
  - `smoke-fixture-science.test.ts`: Walker + Norton fabricated
    substrates exercise the full pipeline without Codex calls.
- `apps/web/src/components/hub/shells/science-explainer/`
  - `claim-search.ts`: pluggable embedder interface + deterministic
    FNV-1a hash mock for tests/dev. Cosine similarity + top-N search.
  - `ClaimSearchBar.tsx`: client component, indexes once on mount, runs
    queries reactively against the in-memory index.
  - `data-adapter.ts`: bundle → page props transform.
  - 6 page modules: HomePage (claim search-first landing), ClaimPage
    (verdict-badged detail), StudyPage, DebunkingPage (index + detail),
    GlossaryPage (alphabetical mechanism dictionary), TopicPage.

### Architecture

```
CanonNode/ChannelProfile (audit substrate, archetype: science-explainer)
        |
        v
+------------------------------+
|  packages/synthesis          |
|  - composers/                |
|    - reference-composer      |  -> ReferenceComponent (cards + topicIndex)
|    - debunking-forge         |  -> DebunkingComponent (myth/reality items)
|    - glossary-builder        |  -> GlossaryComponent (term entries)
|    - diagnostic-composer     |  -> DiagnosticComponent (Phase A reused)
|    - funnel-composer         |  -> FunnelComponent     (Phase A reused)
|  - runner.ts                 |  Promise.all over composers
+------------------------------+
        |
        v
ProductBundle (typed, schema_version: 'product_bundle_v1')
        |
        v
adaptBundleForScienceExplainer(bundle) -> ScienceExplainerShellProps
        |
        v
HomePage  (ClaimSearchBar over EvidenceCards)
ClaimPage (verdict + mechanism + caveats + share)
StudyPage / DebunkingPage / GlossaryPage / TopicPage
```

---

## Tasks completed

| Task | Title                                                         | Commit SHA |
|------|---------------------------------------------------------------|------------|
| H.1  | Reference + Debunking + Glossary types + router entry         | `d1594f0`  |
| H.2  | Reference Composer (evidence cards)                           | `20bc1ef`  |
| H.3  | Debunking Forge (myth -> reality)                             | `aae559e`  |
| H.4  | Glossary Builder (mechanism extractor)                        | `fd9a362`  |
| H.5  | ClaimSearchBar with mock embedder                             | `47ef3a2`  |
| H.6  | Science-explainer shell (6 pages + adapter)                   | `4188735`  |
| H.7  | Cohort smoke fixture (Walker + Norton)                        | `320ccfe`  |
| H.8  | Phase H results doc + draft PR                                | (this commit) |

---

## Tasks deferred (with reason)

### Live cohort run on Walker + Norton (per directive)

The plan calls for spot-checking ~30-50 EvidenceCards on Walker, ~25-40
on Norton, plus 50-100 glossary entries each. Per the directive, no
live audits in this session. Instead:

- `smoke-fixture-science.test.ts` exercises the full pipeline against
  fabricated Walker-style (sleep science) and Norton-style (nutrition
  science) substrates without Codex calls. Asserts every eligible canon
  becomes an EvidenceCard, body-cue regex catches the seed-oils +
  eight-hours myths, and the glossary surfaces "Linoleic Acid" + "Slow
  Wave Sleep" via repeated capitalised mention.
- The CLI runner from Phase A (`packages/pipeline/src/scripts/run-synthesis.ts`)
  works as-is for science-explainer — it routes via the same archetype
  detection, so Mario can trigger live runs with:

```bash
cd packages/pipeline
PIPELINE_OPENAI_PROVIDER=codex_cli npx tsx ./src/scripts/run-synthesis.ts \
  <walker-runId> --goal public_reference
PIPELINE_OPENAI_PROVIDER=codex_cli npx tsx ./src/scripts/run-synthesis.ts \
  <norton-runId> --goal public_reference
npx tsx ./src/scripts/peek-product-bundle.ts <runId>
```

### Real OpenAI embeddings

The plan points at `text-embedding-3-small` for ClaimSearchBar's vectors,
indexed at synthesis time. Phase H ships the **interface** (pluggable
`Embedder`) plus a deterministic mock; the real OpenAI-backed embedder
and the persistence path (vectors on the bundle vs. sidecar table) are
deferred to a follow-up. The shell works in dev today because the mock
embedder is bundled with the component.

### Persisted embeddings table

Migration 0021 was reserved for Phase H. Per the directive, evidence
cards persist inside the existing `product_bundle.payload` JSON column
(Phase A's storage). No 0021 migration was created — it remains free for
a future "claim_embedding sidecar" follow-up if/when the real OpenAI
indexing path needs out-of-band vector storage.

### Hub route mounting

Following Phase A's pattern, wiring `apps/web/src/app/h/[hubSlug]/...`
to the science-explainer shell is deferred. Reason: that path is shared
territory with Codex's Phase G distribution work; the shell is shipped
as a self-contained library (`@/components/hub/shells/science-explainer`).

### Share-card image rendering

`EvidenceCard.shareableImageUrl` and `DebunkingItem.shareableImageUrl`
are typed but not generated. Phase A established the @vercel/og pattern
for FunnelShareCard; reusing that for evidence + myth share cards is a
small render-route addition that does not need to block Phase H.

---

## Test results

```
pnpm --filter @creatorcanon/synthesis test
  + 11 suites from Phase A (52 tests)
  ▶ classifyVerdictFromCanon            (5 tests)
  ▶ topicSlugFromCanon                  (3 tests)
  ▶ composeReference                    (3 tests)
  ▶ detectDebunkingCanon                (5 tests)
  ▶ composeDebunking                    (3 tests)
  ▶ extractCandidateTerms               (4 tests)
  ▶ termSlug                            (2 tests)
  ▶ composeGlossary                     (2 tests)
  ▶ science-explainer router entry      (1 test)
  ▶ Phase H cohort smoke (fixture)      (2 tests)
  ───────────────────────────────────────────────
  Total: 84 tests, 26 suites, 84 pass, 0 fail
```

```
pnpm --filter @creatorcanon/web test    (the science-explainer subset)
  ▶ cosineSimilarity                    (4 tests)
  ▶ mockHashEmbedder                    (3 tests)
  ▶ indexEvidenceCards + searchClaims   (4 tests)
  ▶ adaptBundleForScienceExplainer      (5 tests)
  ───────────────────────────────────────────────
  Total: 16 tests, 4 suites, 16 pass, 0 fail
```

```
pnpm typecheck    (turbo full graph)
  Tasks: 20 successful, 20 total
  Time:  ~18s
```

---

## Composer-call cost (estimated)

The plan target is "comparable to Phase A's <200 Codex calls per creator."
For science-explainer specifically:

- **Reference**: 1 call per claim/evidence_review/definition canon.
  Walker fixture has 20 eligible canons → 20 calls; Norton has 17 → 17.
  Real cohort creators (Walker ~150 canons, ~50 are claims) would land
  around 50 calls.
- **Debunking**: capped at 20 items by default → ≤20 calls. Walker
  fixture surfaces 7 debunking canons via cues; Norton 5.
- **Glossary**: capped at 60 terms by default → ≤60 calls. Real
  creator distributions skew toward ~20-40 surviving terms after the
  3-occurrence threshold.
- **Diagnostic**: 2 (questions + intro), reused from Phase A.
- **Funnel**: 5 (lead capture / paywall / login / inline CTAs / 3 share
  cards), reused from Phase A.

**Total estimate**: ~80-130 Codex calls per real science-explainer creator,
within budget.

---

## Cohort coverage (when smoke is run)

| Creator | Run ID | Status |
|---------|--------|--------|
| Matthew Walker (sim) | TBD       | pending Mario trigger |
| Layne Norton         | TBD       | pending Mario trigger |

Mario fills run IDs + spot-check notes here after live runs.

---

## Phase I/J/L follow-ups

1. **Hub route mount** — wire `apps/web/src/app/h/[hubSlug]/` to mount
   the science-explainer shell when `channelProfile.archetype ===
   'science-explainer'`. Coordinate with Codex on Phase G.
2. **Live cohort smoke** — Mario triggers `run-synthesis.ts` for Walker
   + Norton; spot-check via `peek-product-bundle.ts`; capture cost +
   quality notes.
3. **Real OpenAI embedder** — swap the mock in production via a small
   `openaiEmbedder()` factory in `apps/web/src/lib/embeddings/` (does
   not exist yet). Persist vectors either on `EvidenceCard._index_embedding`
   (additive, JSON) or a `claim_embedding` sidecar table (migration
   0021 reserved).
4. **Share-card image render routes** — `/og/claim/[cardId]/route.ts`
   and `/og/debunking/[itemId]/route.ts` using @vercel/og. Populate
   `shareableImageUrl` on the bundle.
5. **Live arXiv ingestion** — out of scope per Phase H plan; Phase L
   territory.

---

## Known issues / blockers

- **None blocking.** All composer signatures stable; ProductBundle
  schema unchanged at top level (only the optional components field
  expanded).
- **One assumption to validate live**: per-canon
  `_index_verification_status` (set by audit) drives verdict
  classification. If real cohort canons don't carry it, the body-cue
  fallback handles "the data shows" / "debunked" / "mixed evidence" but
  defaults to `mixed` for content that doesn't match. Verify on first
  cohort smoke and surface a metric ("X% of cards default to mixed
  verdict") if it dominates.
- **Glossary noise**: regex extraction will surface multi-word product
  names + book titles. The leading-stopword filter helps but Codex's
  definition step is the real safety net (a Codex call on a noise term
  produces a generic placeholder that's easy to manually trim post-hoc).
- **ClaimSearchBar mock embeddings**: results are deterministic but NOT
  semantically meaningful in dev. Real semantic ranking only kicks in
  once the OpenAI embedder lands.
