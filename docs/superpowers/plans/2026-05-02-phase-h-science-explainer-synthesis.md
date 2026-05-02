# Phase H — Science-Explainer Product Synthesis

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Build the product synthesis layer for science-explainer archetype creators (Walker, Norton). The PRODUCT MOMENT for this archetype is **claim search** — the audience comes asking "does X cause Y? what does the data say?" and gets a verified, evidence-backed answer.

**Architecture:** Reuses the Phase A composer pattern. Adds 2 new composers (Reference Composer for claim/evidence cards, Debunking Forge for "myth → counter-narrative" share artifacts). Also adds a new shell at `apps/web/src/components/hub/shells/science-explainer/`.

**Owner:** Claude (backend semantic).

**Dependencies:** Phase A (composer pattern + ProductBundle types established).

**Estimated weeks:** 6 (weeks 13-18 of meta-timeline).

---

## File structure

```
packages/synthesis/src/composers/
  reference-composer.ts                              ← NEW
  reference-composer.test.ts
  debunking-forge.ts                                 ← NEW
  debunking-forge.test.ts
  glossary-builder.ts                                ← NEW (auto-extract + define mechanisms)
  glossary-builder.test.ts

packages/synthesis/src/types.ts                      ← extend with ReferenceComponent, DebunkingComponent, GlossaryComponent

apps/web/src/components/hub/shells/science-explainer/
  index.tsx
  pages/
    HomePage.tsx                                     ← claim search-first landing
    ClaimPage.tsx                                    ← single claim with evidence cards
    StudyPage.tsx                                    ← single study deep-dive
    DebunkingPage.tsx                                ← myth → counter-narrative
    GlossaryPage.tsx                                 ← mechanism dictionary
    TopicPage.tsx                                    ← claims grouped by topic
  data-adapter.ts
  ClaimSearchBar.tsx                                 ← semantic search component
```

---

## Tasks

### H.1 — ReferenceComponent + DebunkingComponent + GlossaryComponent types

Extend `packages/synthesis/src/types.ts`:

```ts
export interface EvidenceCard {
  id: string;
  claim: string;                        // "Linoleic acid is inflammatory"
  verdict: 'supported' | 'partially_supported' | 'contradicted' | 'mixed';
  mechanismExplanation: string;
  studyEvidenceCanonIds: string[];      // canon nodes that cite specific studies
  caveats: string[];
  counterClaim?: string;
  shareableImageUrl?: string;
}

export interface ReferenceComponent {
  cards: EvidenceCard[];
  topicIndex: Record<string, string[]>; // topic → cardIds
}

export interface DebunkingItem {
  id: string;
  myth: string;                          // "Seed oils cause inflammation"
  reality: string;                       // 1-paragraph counter-narrative
  primaryEvidenceCanonIds: string[];
  shareableImageUrl?: string;
}

export interface DebunkingComponent {
  items: DebunkingItem[];
}

export interface GlossaryEntry {
  id: string;
  term: string;                          // "linoleic acid"
  definition: string;
  appearsInCanonIds: string[];
}

export interface GlossaryComponent {
  entries: GlossaryEntry[];
}
```

Add to `ProductBundle.components`. Update Phase A's router matrix to include these for science-explainer.

### H.2 — Reference Composer

For each canon of type `claim`, `evidence_review`, `definition`:
- Extract the core claim (Codex call: 1 per canon)
- Score the claim's verdict by reading the evidence registry (mostly programmatic from existing `verificationStatus`)
- Cluster related claims by topic
- Build EvidenceCards with linked canon IDs

### H.3 — Debunking Forge

For each canon that pushes back on a popular narrative (detect via voice-fingerprint signals: "fearmongering," "myth," "actually," "the data shows"):
- Extract the myth statement (Codex)
- Pair with the canon's counter-narrative
- Generate shareable card image (uses Phase A's @vercel/og pattern)

### H.4 — Glossary Builder

Programmatic mechanism extractor. For each canon, find named mechanisms (regex: capitalized multi-word terms appearing 3+ times, or identified via Codex). Build GlossaryEntry per term. Cross-link to canons that use the term.

### H.5 — ClaimSearchBar (semantic search)

Frontend component. Embed canon bodies + claim cards via OpenAI text-embedding-3-small (cheap). On query: embed query, cosine-match against pre-computed embeddings, return top-3 results.

Indexing happens at synthesis time; persisted as `_index_embeddings` on each canon (or separate `embedding` table).

### H.6 — Science-explainer shell

6 page types listed in file structure. ClaimPage is the most important — it's where the audience lands from search. Layout: claim verdict at top (badge: ✓ supported / ⚠ partially / ✗ contradicted), evidence cards below, study citations + caveats, "share this" button.

### H.7 — Cohort smoke test

Run synthesis on Walker + Norton runs. Spot-check:
- Walker: ~30-50 EvidenceCards, ~10-15 DebunkingItems (sleep myths)
- Norton: ~25-40 EvidenceCards, ~8-12 DebunkingItems (nutrition myths)
- Glossary: 50-100 entries each

### H.8 — Phase H results doc + PR

Same shape as Phase A's. Document the science-explainer shell pattern + cross-archetype consistency.

---

## Success criteria

- [ ] 2 cohort creators (Walker + Norton) have full science-explainer product bundles
- [ ] ClaimSearchBar returns relevant results for test queries (e.g., "do seed oils cause inflammation" → Norton's seed oils card)
- [ ] DebunkingItems have shareable images that load correctly
- [ ] Glossary entries cross-link bidirectionally with canons

## Out of scope

- Crowdsourced study additions (creators add their own studies)
- Real-time arXiv ingestion (stays with what's in source videos)
