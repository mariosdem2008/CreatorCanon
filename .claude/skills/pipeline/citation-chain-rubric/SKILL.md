---
name: citation-chain-rubric
description: Use whenever a generation step produces claims that should trace to evidence (VICs, canon nodes, syntheses, briefs). Defines the citation token format that makes claims linkable to YouTube timestamps and the rules for which level of artifact cites which level of evidence.
---

# Citation Chain Rubric

## PURPOSE
Every claim in the pipeline ultimately answers to a transcript segment in a specific video at a specific timestamp. This rubric defines the citation token format that lets the audit page render any claim as a clickable YouTube link, and the layered citation rules so each artifact cites the right level (VICs cite segments, canon cites segments, syntheses cite canon, briefs cite canon).

## SCHEMA

A citation token is a square-bracketed identifier embedded inline in a string field. Three legal forms:

```
[<segmentId>]                     // UUID of a segment row — RECOMMENDED for transcript evidence
[cn_<canon_node_uuid>]            // canon node ID — used by syntheses and briefs
[m:ss-m:ss]                       // pure time range — fallback when no segmentId is available
```

ILLEGAL forms (these break the linkifier):

```
[<startMs>ms-<endMs>ms]           // ms-range without videoId binding — cannot resolve to a YouTube URL
[12345-23456]                     // bare numbers, ambiguous
```

## RUBRIC

- **Every quoted claim should cite**: VIC `mainIdeas`, `lessons`, `examples`, `stories`, `mistakesToAvoid`, `strongClaims`, `contrarianTakes` — each item should ideally include at least one `[<segmentId>]` so the audit page can linkify it to a YouTube timestamp.
- **Citation token format**: `[<segmentId>]` where `<segmentId>` is the UUID exactly as shown in the transcript block. The UUID's videoId binding (in the segment table) is what enables the linkifier to construct the YouTube URL.
- **AVOID `[<startMs>ms-<endMs>ms]`**: ms-range citations cannot be resolved to YouTube URLs because they lack the videoId binding. They get rendered as plain text. If you write `[12345ms-23456ms]` instead of `[<segmentId>]`, you've broken the citation chain.
- **Pure time references**: when you need to reference a moment WITHOUT linkifying it (e.g. talking about a segment in the abstract), use `[m:ss-m:ss]` format — just the time, no IDs. The renderer treats this as text, not a link.
- **Layered citation rules** — each artifact cites the level immediately below it:
  - **VICs** → cite segment IDs (`[<segmentId>]`)
  - **Canon node payload fields** (`steps`, `examples`, `preconditions`, `failureModes`, `quotes`) → cite segment IDs (same rule as VICs)
  - **Syntheses** → cite canon node IDs (`childCanonNodeIds: ["cn_..."]`), NOT segmentIds. Syntheses are meta-level; their evidence is canon, not transcript.
  - **Briefs** → cite canon node IDs in `outline[].canonNodeIds`, `primaryCanonNodeIds`, `supportingCanonNodeIds`. Briefs reference canon, canon references segments — the chain is transitive.
- **Visual moments** are linkable through `segmentId` because the `visual_moment` table has a `segmentId` column. To cite a visual moment with a linkifiable timestamp, use `[<segmentId>]` of the segment containing it (not `[<visualMomentId>]`).
- **Don't fabricate IDs**: every UUID/cn-id in a citation must exist in the run's data. The audit page will surface missing IDs as broken links.
- **Don't double-cite**: one good citation per claim is enough. Spamming `[id1][id2][id3]` after every clause makes prose unreadable.
- **Quote attribution**: when a `quotes[]` item is verbatim from one segment, cite that segment. Verbatim quotes without citations are flagged as low-evidence by `citation_grounder`.

## EXAMPLES_GOOD

1. VIC mainIdea:
   ```
   "Hormozi argues most founders mistake activity for progress [a1a6709f-a2a7-48f4-839b-82687165fbdd]"
   ```
2. VIC strongClaim:
   ```
   "If you can't sell it 1-on-1 for $5K, you can't sell it at $500 to 100 people [4d9c0b1e-3f2a-4c8b-9e1d-7f5b8a2c1d3e]"
   ```
3. Canon node failureMode:
   ```
   "Hiring before the workflow is documented [c2e1f4a8-9b6d-4e3f-a7c5-1b2d8f9a0e6c]"
   ```
4. Synthesis childCanonNodeIds:
   ```json
   "childCanonNodeIds": ["cn_workflow_based_thinking", "cn_premium_one_on_one_bootstrap", "cn_first_100k_roadmap"]
   ```
5. Brief outline section:
   ```json
   { "sectionTitle": "Why workflows beat job titles", "canonNodeIds": ["cn_workflow_based_thinking", "cn_hiring_for_outcomes"], "intent": "Show the operator why every hire failed for the same reason." }
   ```
6. Pure time reference (no segment available):
   ```
   "Around the 12:30-13:45 mark Hormozi summarizes the entire offer-test framework."
   ```

## EXAMPLES_BAD

1. ms-range citation that can't linkify:
   ```
   "Hormozi mentions cash flow [12345ms-23456ms]"   // breaks linkifier
   ```
2. Bare-number citation:
   ```
   "He defines BYOA [12345-23456]"   // ambiguous, no protocol
   ```
3. Synthesis citing segments instead of canon:
   ```json
   "childCanonNodeIds": ["a1a6709f-a2a7-48f4-839b-82687165fbdd"]   // wrong level
   ```
4. Brief citing segments instead of canon:
   ```json
   "primaryCanonNodeIds": ["a1a6709f-a2a7-48f4-839b-82687165fbdd"]   // wrong — briefs cite canon
   ```
5. Hallucinated ID:
   ```
   "Hormozi says X [00000000-0000-0000-0000-000000000000]"   // ID doesn't exist
   ```
6. Citation spam:
   ```
   "He explains [id1] that operators [id2] should focus on [id3] cashflow [id4]."   // unreadable
   ```

## ANTI_PATTERNS

- **The ms-range temptation**: when the transcript block shows `[<segmentId>] <startMs>ms-<endMs>ms: <text>`, models sometimes copy the ms range thinking it's the citation. The citation is the SEGMENT ID, not the ms range.
- **Cross-level citation**: a synthesis with `childCanonNodeIds: ["a1a6709f-..."]` (a segment UUID, not a `cn_` ID) is a level error. Match the citation level to the artifact level.
- **Visual moment IDs in prose**: `visualMomentId` UUIDs are not the linkifier's input — use the underlying `segmentId` instead.
- **Faking high evidence**: tagging every claim with `evidenceQuality: "high"` while leaving most VIC items uncited. The downstream `citation_grounder` will demote these to `limited`.
- **Quote without citation**: a `quotes[]` item that's verbatim from a segment but has no `[<segmentId>]` token. Always cite verbatim quotes.
- **Unit confusion in pure-time form**: writing `[12.5-13.7]` (decimal minutes) or `[750-820]` (raw seconds). Always use `m:ss` format: `[12:30-13:42]`.

## OUTPUT_FORMAT

```
# CITATION FORMAT
When citing transcript evidence inline (in main ideas, lessons, examples, stories, mistakes, claims, contrarian takes, framework steps, canon-node failure modes, etc.), prefer `[<segmentId>]` — the segment's UUID exactly as shown in the transcript block. This format lets the markdown export render the claim as a clickable YouTube timestamp.

AVOID `[<startMs>ms-<endMs>ms]` ranges — they cannot be linkified back to a YouTube URL because they lack the videoId binding.

If you genuinely need a time range without a segmentId, use `[m:ss-m:ss]` format (just the time, no IDs).

# CITATION LEVEL RULES
- VICs cite segment IDs.
- Canon node payload fields cite segment IDs.
- Syntheses cite canon node IDs (cn_...), NOT segmentIds — synthesis is meta-level.
- Briefs cite canon node IDs in outline[], primaryCanonNodeIds[], supportingCanonNodeIds[].
- Visual moments are linkable through their underlying segmentId, not visualMomentId.

Do not fabricate IDs. Every UUID/cn-id in a citation must exist in the run's data.
```
