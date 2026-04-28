# Canon v1 (Stage 1) — Operator Runbook

## Engine modes

`PIPELINE_CONTENT_ENGINE` selects which content engine the orchestrator runs:

| Value | Path |
|---|---|
| `findings_v1` (default) | discovery -> synthesis -> verify -> merge -> adapt |
| `canon_v1` | channel_profile -> visual_context -> video_intelligence -> canon -> page_briefs -> page_composition -> page_quality -> adapt |

Both engines share Phase 0 ingestion (snapshot, transcripts, normalize, segment) and the final `adapt` stage.

## Quality modes

`PIPELINE_QUALITY_MODE` picks the right model per canon_v1 agent based on the cost-quality tradeoff for that agent's task character. Set it once; you almost never need to override individual agents.

| Mode | Cost / 5h hub | Quality | When to use |
|---|---|---|---|
| `lean` | ~$0.20 | Adequate; canon synthesis softer | Free tier, validation runs |
| `production_economy` (default) | ~$1.50 | Equal or better than `premium` | Paid tier baseline |
| `premium` | ~$6.84 | Maximum | When users pay >$50/hub |

Per-agent assignments:

| Agent | lean | production_economy | premium |
|---|---|---|---|
| visual_frame_analyst | flash | flash | flash |
| channel_profiler | flash | flash | gpt-5.5 |
| video_analyst | flash | **pro** | gpt-5.5 |
| canon_architect | pro | **gpt-5.5** | gpt-5.5 |
| page_brief_planner | flash | flash | gpt-5.5 |
| page_writer | flash | flash | gpt-5.5 |

Why `production_economy` is the recommended default: canon synthesis is the highest-leverage judgment (it determines what the hub is _about_), so it stays on the most capable model. Everything else is constrained extraction or structural planning, where Gemini Flash and Pro give equal-or-better results at a fraction of the cost.

Override one agent without changing the mode:
```
PIPELINE_QUALITY_MODE=production_economy
PIPELINE_MODEL_VIDEO_ANALYST=gpt-5.5    # bump video_analyst back to premium
```

Resolution priority (most specific first):
1. `PIPELINE_MODEL_<AGENT>` — per-agent explicit override
2. `PIPELINE_QUALITY_MODE` — preset that picks a model per agent
3. `PIPELINE_MODEL_MODE` — provider preference (hybrid|gemini_only|openai_only)
4. registry default

Cost-cutting levers active in canon_v1:

- **Pre-loaded context**: video_intelligence / canon / page_briefs receive every input they need (channel profile + transcripts + visual moments + canon nodes) in the opening user message. Cuts per-stage LLM calls 5-10x vs the original "agent-calls-tools-iteratively" pattern.
- **Cached input pricing**: OpenAI `prompt_tokens_details.cached_tokens` automatically priced at 50% off; Gemini `cachedContentTokenCount` priced at 25% off. Cost-tracking honors both.
- **Gemini context cache**: video_intelligence pre-creates a cachedContents row for the channel-profile prefix and reuses it across all 20 per-video calls — the prefix bills at 25% across the fan-out.

## Smoke testing canon_v1

Pre-flight:

1. Set env vars locally and in your deploy:
   ```
   PIPELINE_CONTENT_ENGINE=canon_v1
   PIPELINE_QUALITY_MODE=production_economy   # recommended default
   PIPELINE_VISUAL_CONTEXT_ENABLED=true       # default
   ```
2. Confirm every video in your test selection has a `video_mp4` mediaAsset
   (newly-uploaded videos auto-persist this; for older uploads run the
   backfill once):
   ```
   cd packages/db && cp ../../scripts/backfill-mediaasset-video-mp4.mjs ./_b.mjs && node ./_b.mjs && rm ./_b.mjs
   ```
3. Trigger a generation run via the web UI's "Generate hub" button. Capture
   the runId from the resulting URL or DB row.

Inspect:

```bash
cd packages/db && cp ../../scripts/inspect-canon-run.mjs ./_i.mjs && node ./_i.mjs <runId> && rm ./_i.mjs
```

Verify (Phase 12 hard-pass criteria):

```bash
cd packages/db && cp ../../scripts/verify-canon-run.mjs ./_v.mjs && node ./_v.mjs <runId> && rm ./_v.mjs
```

Exit code 0 = all criteria pass. Exit code 3 = at least one criterion failed.

## Hard-pass criteria (must all pass before promoting canon_v1 to default)

- `pageCount in [4, 12]`
- `pages with readerProblem == 100%`
- `pages with promisedOutcome == 100%`
- `duplicate slugs == 0`
- `generic titles <= 1`
- `avg citations per page >= 5`
- `>= 1 canon_node with origin in {multi_video, derived} AND >= 2 source videos`
- `pagesWhereVisualIsSoleEvidence == 0` (always)

## Visual metrics (informational — zero is valid)

- `visualMomentsCreated`: 0 is valid for talking-head archives or runs with no mp4 sources
- `videosWithMp4Source` / `videosSkippedNoMp4`: count of selected videos with vs without a `video_mp4` mediaAsset
- `pagesWithVisualCallouts`: count of pages whose blockTree contains at least one block with `_visualMomentId`

## Triage

If `verify-canon-run.mjs` fails, run `inspect-canon-run.mjs` to see per-stage status and per-table cardinality. Common failure modes:

- `pageCount < 4`: page_brief_planner produced too few briefs. Check that canon has enough page-worthy nodes (`pageWorthinessScore >= 60`).
- `avg citations per page < 5`: page_writer's LLM path may be falling back to deterministic. Check page_quality_report payload for `unsupportedClaimCount`.
- `pagesWhereVisualIsSoleEvidence > 0`: page_quality should already be flagging these as fail; re-run page_composition if a brief slipped through.
- `>= 1 multi_video canon_node` failing: archive may be too small (< 3 videos with overlapping themes). Try with more videos or a more cohesive set.
