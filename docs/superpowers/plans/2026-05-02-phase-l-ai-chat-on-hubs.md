# Phase L — AI Chat on Hubs (RAG-grounded)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Every published hub has a "Chat with [Creator]'s knowledge" widget. Audience asks questions in natural language, gets answers grounded in the creator's audited content (canons, evidence, action plans, worksheets, transcripts) — never hallucinating outside the creator's voice. Each chat message debits the creator's chat-credit balance (Phase N ledger). Available only when creator pays the maintenance subscription (Phase E).

**Architecture:**
- **Indexer:** at synthesis time (Phase A) and on every republish (Phase B), embed all canon bodies + evidence cards + action-plan steps + worksheet copy + page briefs via OpenAI text-embedding-3-small (cheap). Persist to Postgres `chat_chunk` table with pgvector OR plain JSON + cosine in-app (start in-app for simplicity, migrate to pgvector at scale).
- **Retriever:** top-k=8 cosine match on the user query embedding.
- **Composer:** Codex CLI (or GPT-4o-mini if Codex CLI rate-limits) gets the retrieved chunks as context, must answer ONLY from those chunks, cite chunk source IDs. System prompt enforces "I don't know — that's not in [Creator]'s content" when retrieval is weak.
- **Streaming:** Server-Sent Events from `/api/hub/[hubId]/chat`. Token-streaming for snappy UX.
- **Quota:** every message decrements `chat_credits` from creator's Phase N ledger. When 0, chat surface shows "This hub has temporarily run out of AI chat credits — the creator can top up to re-enable."

**Owner:** Claude (backend RAG pipeline + indexer + API) + Codex (chat widget UI + streaming consumer).

**Dependencies:**
- Phase A (canons + evidence + briefs to index)
- Phase H (extends index to claim cards / evidence — for science-explainer)
- Phase E (maintenance subscription state — gate on it)
- Phase N (credit ledger — debit on each msg)

**Estimated weeks:** 5 (weeks 16-21 of meta-timeline).

---

## File structure

```
packages/synthesis/src/chat/                          ← Claude
  indexer.ts                                          ← embed + persist to chat_chunk
  retriever.ts                                        ← top-k cosine over chat_chunks for a hub
  composer.ts                                         ← prompt + Codex CLI / GPT-4o call
  streaming.ts                                        ← SSE response builder
  refusal-detector.ts                                 ← if retrieved chunks weak, force "I don't know"
  index.ts

packages/synthesis/src/chat/test/
  indexer.test.ts
  retriever.test.ts
  composer.test.ts                                    ← golden tests with fixture hub

packages/db/src/schema/
  chat.ts                                             ← chat_chunk, chat_session, chat_message tables
packages/db/drizzle/
  0024_phase_l_chat.sql

apps/web/src/app/api/hub/[hubId]/chat/
  route.ts                                            ← POST: streams answer (SSE)
  stream/route.ts                                     ← internal SSE handler

apps/web/src/components/hub/chat/                     ← Codex
  ChatWidget.tsx                                      ← floating button → expands to chat panel
  ChatPanel.tsx                                       ← message list + input
  ChatMessage.tsx                                     ← single message bubble (with citations)
  CitationCard.tsx                                    ← inline source preview
  CreditExhaustedNotice.tsx                           ← "this hub is out of chat credits"
```

---

## Tasks

### L.1 — DB schema

```ts
export const chatChunk = pgTable('chat_chunk', {
  id: uuid('id').primaryKey().defaultRandom(),
  hubId: uuid('hub_id').notNull(),
  sourceKind: varchar('source_kind', { length: 32 }).notNull(),    // canon | evidence | action_plan | worksheet | brief
  sourceId: varchar('source_id', { length: 64 }).notNull(),
  content: text('content').notNull(),                              // chunk text (max ~600 tokens)
  embedding: jsonb('embedding').notNull(),                         // float[1536] as JSON; pgvector later
  metadata: jsonb('metadata'),                                     // {title, position, tags}
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const chatSession = pgTable('chat_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  hubId: uuid('hub_id').notNull(),
  visitorIdentifier: varchar('visitor_identifier', { length: 64 }).notNull(),  // hashed IP+UA or magic-link user
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow(),
});

export const chatMessage = pgTable('chat_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull(),
  role: varchar('role', { length: 8 }).notNull(),                 // user | assistant
  content: text('content').notNull(),
  citationChunkIds: jsonb('citation_chunk_ids'),                  // string[] of chat_chunk IDs
  costCents: integer('cost_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

Migration 0024.

### L.2 — Indexer (write side)

`packages/synthesis/src/chat/indexer.ts`:
- `indexHub(hubId)`: pulls all canons + evidence cards + action-plan steps + worksheets + briefs for the hub. Chunks each into ~600-token windows (use existing `chunkText` util in pipeline if present; else implement). For each chunk, call OpenAI text-embedding-3-small → store in `chat_chunk`.
- Idempotent: deletes existing rows for `hubId` before re-indexing.
- Hooked into Phase A's synthesis-runner (after ProductBundle persists) and Phase B's republish API.

### L.3 — Retriever

`retriever.ts`:
- `retrieve(hubId, query, k=8)`: embeds query, fetches all `chat_chunk` rows for `hubId`, computes cosine similarity in-app, returns top-k with scores.
- Optimization: if a hub has > 5,000 chunks, paginate + filter via simple keyword pre-filter before embedding cosine.
- Returns `{chunks: ChatChunk[], averageScore: number}`. Average score < 0.65 → trigger refusal in composer.

### L.4 — Composer + streaming

`composer.ts`:
- System prompt: "You are an assistant for [Creator]'s knowledge hub. Answer ONLY using the provided sources. Cite sources by ID. If the sources don't contain the answer, say 'I don't know — that's not in [Creator]'s content.' Never speculate."
- Includes top-8 chunks as context with `[id]` markers.
- Streams via OpenAI Responses API (or Codex CLI in non-streaming + buffered chunks if rate-limited).

`streaming.ts`: wraps the LLM stream into SSE.

### L.5 — Refusal detector

`refusal-detector.ts`: invoked before composer. If retriever's `averageScore < 0.65` OR top chunk score < 0.7, short-circuit composer and return canned refusal message + zero credits debited.

### L.6 — API route

`POST /api/hub/[hubId]/chat`:
1. Resolve `hubId` → maintenance subscription active? (Phase E entitlements API). If not, return 402 Payment Required + UI message.
2. Resolve creator's chat-credit balance (Phase N). If < 1, return 402 with "out of credits" message.
3. Insert / update `chat_session` keyed on visitor identifier.
4. Insert user `chat_message`.
5. Run retriever → composer → SSE.
6. On stream completion, insert assistant `chat_message` with citations + cost.
7. Phase N: `creditLedger.consume({userId: hubOwnerUserId, kind: 'chat_credits', amount: 1, source: `chat_msg:${msgId}`})`.

### L.7 — Chat widget UI

**Codex.** `ChatWidget.tsx`:
- Floating button bottom-right of hub.
- Click → expands to side panel.
- Message list with autoscroll.
- Streams assistant response token by token.
- Citations render as numbered inline tags `[1]`; clicking → side preview with source canon excerpt + link to full canon page.

`ChatPanel.tsx`: input + send button + message list.

### L.8 — Audience-side rate limiting

Visitor identifier: SHA256(IP + UA + hubId + daily-rotating-salt). Limit 30 messages/visitor/hour at the edge (Vercel middleware). Hard limit 200 messages/visitor/day. Surfaces "you're sending messages too fast" copy.

This is independent of Phase N's per-creator chat credits — it's audience abuse prevention.

### L.9 — Cost-counted toggle (admin)

Internal admin flag: turn off all hub chat globally for emergency cost containment (in case of runaway spend). Phase K admin dashboard surfaces this.

### L.10 — Re-index on edit (Phase B integration)

When Phase B's republish API fires, re-index. Targeted: only re-embed changed canons (compare hash of canon body to stored hash). Saves embeddings cost.

### L.11 — Cohort smoke test

Run indexer on Hormozi's hub. Test queries:
- "How do I price my first offer?" → should retrieve action-plan steps + canon snippets
- "What does Hormozi say about cold outbound?" → should pull relevant canon
- "What's the GDP of France?" → refusal triggers correctly

Verify citations point to real canons.

### L.12 — Testing + PR

- Unit: indexer chunking logic; retriever cosine math; refusal detection threshold
- Integration: full request → response with fixture hub
- E2E (Playwright): open hub → click chat widget → send message → see streamed answer + citation
- PR title: "Phase L: AI chat on hubs (RAG-grounded, citation-backed, credit-debited)"

---

## Success criteria

- [ ] Indexer covers all 7 cohort hubs without errors
- [ ] Retriever returns relevant chunks for test queries (cosine > 0.7 for in-domain queries)
- [ ] Refusal triggers on out-of-domain queries 100% of the time on test set
- [ ] Streaming arrives at client < 1s first token, < 6s full answer (P95)
- [ ] Citation links work + open relevant canon page
- [ ] Each message debits creator's chat_credits correctly (Phase N integration)
- [ ] Maintenance-off hub returns 402 from chat API

## Risk callouts

- **Hallucination despite RAG** — composer ignores instructions and answers from training data. Mitigation: refusal detector with average-score threshold + LLM-as-judge eval on test set; if hallucination > 5% on golden set, raise refusal threshold.
- **Embedding cost at scale** — re-indexing on every save = OpenAI bill. Mitigation: hash-based incremental indexing; only embed changed chunks.
- **Audience abuse / scraping creator content via chat** — actor pulls full content via Q&A. Mitigation: visitor rate limits + composer prompt forbids verbatim quoting > 25 words from any single chunk.
- **Latency on first message of a session** — cold-start retrieval takes longer. Mitigation: prewarm retriever on widget open (fire request before user types).

## Out of scope

- Multi-turn deep agent (single-turn Q&A v1)
- Audio/voice chat (text v1)
- Personalization across visitors (each session independent v1)
- pgvector migration (in-app cosine v1; migrate when chunks > 10k per hub)
- Multi-hub federated search (single-hub v1)
