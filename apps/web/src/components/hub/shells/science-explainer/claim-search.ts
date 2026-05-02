/**
 * Claim search — semantic search over EvidenceCards for the science-explainer
 * shell.
 *
 * Production: at synthesis time, OpenAI text-embedding-3-small embeds each
 * card's "claim + mechanismExplanation" text. The embeddings live on the
 * card payload (or a sidecar table). At query time, embed the query, cosine-
 * match against pre-computed vectors, return top-N.
 *
 * Tests + dev: a deterministic hash-based mock embedder (`mockHashEmbedder`)
 * stands in for OpenAI. It produces a fixed-dimension vector from a string by
 * unrolling a 32-bit FNV-1a hash across the dimensions. It is NOT semantically
 * meaningful — but it IS deterministic, so tests can assert "exact match
 * query returns the matching card first" without flakiness.
 *
 * Embeddings are pluggable: the search functions accept an `Embedder`
 * interface, so production code injects the real OpenAI client and tests
 * inject the mock.
 */

import type { EvidenceCard } from '@creatorcanon/synthesis';

export interface Embedder {
  /** Returns a fixed-dimension vector (length === dimensions) for the input. */
  embed(text: string): Promise<number[]>;
  /** Length of the vectors produced by embed(). */
  dimensions: number;
}

export interface IndexedCard {
  card: EvidenceCard;
  vector: number[];
}

export interface SearchHit {
  card: EvidenceCard;
  score: number;
}

/* ----------------------------- mock embedder ---------------------------- */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a32(input: string, seed = FNV_OFFSET): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Mock embedder: deterministic hash → vector. NOT real semantics, but stable
 * for tests. Two identical strings always yield identical vectors; perturbing
 * the string changes the vector deterministically.
 */
export function mockHashEmbedder(dimensions = 32): Embedder {
  return {
    dimensions,
    embed: async (text: string) => {
      const normalized = text.toLowerCase().trim();
      const out = new Array<number>(dimensions);
      for (let i = 0; i < dimensions; i += 1) {
        // Different per-dimension seed so dimensions don't collapse.
        const seed = (FNV_OFFSET ^ (i * 2654435761)) >>> 0;
        const h = fnv1a32(normalized, seed);
        // Map to [-1, 1] range deterministically.
        out[i] = ((h % 20001) - 10000) / 10000;
      }
      return out;
    },
  };
}

/* ------------------------------ math utils ------------------------------ */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dimension mismatch ${a.length} vs ${b.length}`,
    );
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

/* ------------------------------ index + search ------------------------------ */

/** Stringify a card to a single body for embedding. */
function cardEmbeddingText(card: EvidenceCard): string {
  return [
    card.claim,
    card.mechanismExplanation,
    card.counterClaim ?? '',
    card.caveats.join(' '),
  ]
    .filter((s) => s && s.length > 0)
    .join(' \n ')
    .slice(0, 4000);
}

/**
 * Build an in-memory index. In production this happens at synthesis time
 * and the vectors are persisted with the bundle; this function makes the
 * shell's claim search self-contained for dev + tests.
 */
export async function indexEvidenceCards(
  cards: EvidenceCard[],
  embedder: Embedder,
): Promise<IndexedCard[]> {
  return Promise.all(
    cards.map(async (card) => ({
      card,
      vector: await embedder.embed(cardEmbeddingText(card)),
    })),
  );
}

/**
 * Run a query through the embedder, score every indexed card by cosine
 * similarity, and return the top-N hits.
 */
export async function searchClaims(
  query: string,
  index: IndexedCard[],
  embedder: Embedder,
  topN = 3,
): Promise<SearchHit[]> {
  if (query.trim().length === 0 || index.length === 0) return [];
  const queryVector = await embedder.embed(query);
  const scored: SearchHit[] = index.map(({ card, vector }) => ({
    card,
    score: cosineSimilarity(queryVector, vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
