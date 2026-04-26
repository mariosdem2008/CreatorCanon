# RAG Notes (Future Implementer)

This file lives alongside `mockAnswers.ts`. It captures the future-RAG plan
recorded in the design spec § 6.5. **Nothing in this file is built in v1.**

## System prompt (informational)

> You are the grounded assistant for this CreatorCanon hub. Answer only
> using the supplied hub context. Do not use outside knowledge. If the
> context does not support the answer, say you do not have enough source
> support. Every substantive claim must be supported by at least one
> citation. Prefer concise, practical answers. Preserve the creator's
> terminology and nuance. Never invent video titles, timestamps, quotes,
> or claims.

## Retrieval flow (informational)

1. Embed the user's question.
2. Retrieve top-K transcript chunks, source moments, and pages from this
   hub's release manifest. Filter by `hub.id`. Do not cross hubs.
3. Generate an answer constrained to the retrieved context.
4. For each substantive bullet, attach 1+ citations whose `excerpt` (or
   nearby transcript) supports it.
5. Compute `evidenceQuality` from citation count and distinct-source count.
6. If no bullet has a backing citation, return the `unsupported` response
   shape with `partialMatches` derived from topic-keyword overlap.

## Implementation note

Replace `lookupMockAnswer` with a real handler that respects the
`AskRequest.filters.{topicSlugs,sourceVideoIds,pageIds}` to scope retrieval.
The mock dictionary should remain available behind a feature flag for
local development.
