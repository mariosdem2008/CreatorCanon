# Phase H — Code Review Follow-ups

> Captured 2026-05-02 from independent code review of PR #20.
> 3 HIGH issues fixed inline before merge. MEDIUM tracked for Phase B/I/L.

## Fixed in this PR (HIGH)

1. **Archetype parameterization in shared composers (`diagnostic-composer.ts`, `funnel-composer.ts`).**
   Both prompts hardcoded "operator-coach hub", but the runner reuses these composers for science-explainer (and will for Phase I/J). Without the fix, Codex would draft operator-coach-flavored questions/CTAs/paywall copy on Walker/Norton runs. Now: `archetypeDescriptor(input)` reads `input.channelProfile.archetype` and substitutes the right noun phrase. Diagnostic intro additionally swaps the call-to-action ("get the right evidence" for science-explainer, "get your next move" for operator-coach, etc.) to match the archetype's product moment.

2. **`rhetoricalMoves` dead path documented as a forward hook.**
   `debunking-forge.ts` keys off `_index_voice_fingerprint.rhetoricalMoves` tags, but the audit pipeline doesn't emit them today. Code stays in place (deletion would be wasted work later) with a TODO marker pointing at the audit-side enhancement that needs to wire it. Smoke fixture continues to fabricate the tags so the hook is exercised in tests.

3. **`ClaimSearchBar` embedder memo trap.**
   `useMemo(() => embedder ?? mockHashEmbedder(), [embedder])` would have invalidated every render when Phase L wires a real OpenAI embedder via inline prop — re-indexing the entire claim library on every render → infinite loop. Now: dual API — `embedderFactory` (called once on mount, preferred) OR a stable `embedder` instance. New `embedderKey` prop is the explicit invalidation hook. Memo no longer depends on the embedder identity. Documented in the prop JSDoc so Phase L wiring is unambiguous.

Tests after fixes: **84/84 pass**. Web typecheck clean.

## Tracked for Phase B integration sweep (MEDIUM)

1. **Mock embedder is identity-only, not similarity-preserving.** `claim-search.ts:59-75` per-dimension FNV hashes the *whole normalized string*, so any token change → uncorrelated vector. Real-world dev (where mechanisms are non-empty) means paraphrase queries look broken. Acceptable for "deterministic" but document it loudly OR replace with a token-bag bag-of-words style mock that produces near-similar vectors for near-similar text. Phase L will replace with real OpenAI embeddings.

2. **No runner integration test for science-explainer end-to-end.** `runner.test.ts` covers operator-coach + `_DEFAULT` only. The "router → all 3 new composers → bundle" path lives only in `smoke-fixture-science.test.ts` with a stub Codex. Add a minimal "runner produces a science-explainer bundle with all expected component keys" runner test.

3. **Glossary builder regex catches person names + multi-cap proper nouns indiscriminately.** `glossary-builder.ts:94-95` will glossary-ize "Mediterranean Diet" or "Stanford University" or "Andrew Huberman" — costing Codex calls for non-mechanism terms. The 60-cap saves the budget but pollutes. Add a person-name + place-name stopword list, or a Codex pre-filter that classifies "is this a mechanism or a proper noun?".

4. **`extractCandidateTerms` `seenInCanon` set is unused.** Aborted refactor. Either remove or use it to count *unique-canon* occurrences (better signal than total mentions).

5. **Reference + Debunking ID collision risk on retried runs.** Card IDs `card_${canon.id}` + Debunking item IDs `myth_${canon.id}` — if a single canon ever surfaces as both eligible (`type: 'claim'`) AND debunking (body cue match), it'll appear in both `cards[]` and `items[]` without cross-reference. Set `DebunkingItem.evidenceCardId` cross-link, OR dedupe at runner.

6. **Prompt-detection brittleness in smoke fixture.** Stub Codex matches by `prompt.includes('evidence card')` etc. Reword the prompts and the stub silently returns `{}`, graceful fallback kicks in, test passes anyway with a degraded bundle. Single-source-of-truth prompt verb constants would prevent silent degradation.

7. **Diagnostic UX needs archetype-aware specialization beyond just the prompt.** Even after HIGH-1, the science-explainer audience wants "answer 5 questions, get the right claim card" — not "get your next move." Phase B/I follow-up: consider archetype-specific diagnostic UI/scoring.

8. **Hub route mount deferred but only tracked in this doc.** No issue / TODO marker. Phase B mount sweep should land `apps/web/src/app/h/[hubSlug]/...` with archetype-routing for both operator-coach (Phase A) AND science-explainer (Phase H).

## Tracked for audit pipeline (LOW)

- **`rhetoricalMoves` voice-fingerprint emission.** Stage 6/7 audit-side enhancement that classifies rhetorical posture (myth-busting, fearmongering-pushback, contrarian-evidence). Not Phase H scope; documented for future audit work.
- **Searchby score threshold.** `searchClaims` returns top-N by score regardless of score magnitude. With real embeddings, add a minimum-cosine threshold (~0.6) so irrelevant queries return "no matches" rather than the 3 least-bad ones. Mock embedder makes this hard to test today.

## Notes from review

- Codex-territory check: clean. No files at `apps/web/src/lib/vercel/`, `apps/web/src/components/onboarding/`, distribution UI. Only Phase H new files — migration 0021 reserved but unused (evidence cards persist inside `product_bundle.payload` JSON, like Phase A).
- Conflict-prevention compliance: Phase A composer files untouched (verified by diff). Phase N's `packages/synthesis/src/credits/` untouched.
- Cross-archetype consistency: `index.tsx` exports follow the same shape as Phase A's operator-coach shell. `data-adapter.ts` interface mirrors operator-coach's. ✓
- ProductBundle types extension is purely additive — `cards?: never` and `lessonSequence?: never` placeholders are preserved for Phase I/J to flip to real types.
