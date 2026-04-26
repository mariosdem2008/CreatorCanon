# Pipeline → EditorialAtlasManifest Adapter — Follow-Up Spec Brief

**Status:** Brief / not designed yet
**Depends on:** [`2026-04-25-editorial-atlas-hub-design.md`](2026-04-25-editorial-atlas-hub-design.md)

## Why this exists

The Editorial Atlas template ships with a mock manifest at
`apps/web/src/lib/hub/manifest/mockManifest.ts`. The pipeline currently
emits the older `release_manifest_v0` schema. To wire real hub data into
the Editorial Atlas template we need an adapter:

```ts
buildEditorialAtlasManifestFromRelease(input: {
  release: ReleaseRow,
  manifestV0: ReleaseManifestV0,
  draftPages: DraftPagesV0Artifact,
  sources: SourceVideo[],          // joined from `youtube_video` + transcripts
  /* …more inputs as needed */
}): EditorialAtlasManifest
```

## In scope (next session)

1. Define mapping rules: which v0 blocks become which v1 section kinds.
2. Decide which Editorial Atlas fields are derivable from current pipeline
   output (most metadata) vs. need new pipeline stages (key moments,
   aha_moments, evidence quality scoring, topic taxonomy, illustration choice).
3. Decide what to do for fields that have no data source yet — empty array,
   placeholder, or "skip section" (the renderer handles all three per § 5.5).
4. Write the adapter, swap the route from mock to real, gate behind a
   feature flag for a canary window.

## Out of scope

- New pipeline stages themselves. The adapter brokers existing data; pipeline
  changes are a third project.
- Any change to the renderer or template — the contract is settled.

## Open questions for the brainstorming pass

- Where does `Topic` taxonomy come from? Manual curation? Cluster output?
- How are `keyMoments` and `aha_moments` synthesized — LLM stage or marker-detection?
- How is `evidenceQuality` computed — citation count threshold, distinct-source
  count, semantic similarity, or editor input?
- Visibility: how does `unlisted` interact with the publish flow?

(Brainstorming and writing-plans skills will design the rest.)
