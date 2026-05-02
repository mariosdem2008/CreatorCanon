/**
 * Theme Curator — clusters AphorismCard[] into ThemeCollection[] by
 * embedding similarity, then asks Codex to name each cluster.
 *
 * Pipeline:
 *   1. Embed every card.text via the injected Embedder.
 *   2. Greedy cosine-similarity agglomeration: walk cards in order; if a
 *      card's centroid lies within `similarityThreshold` of an existing
 *      cluster's centroid, fold it in; otherwise start a new cluster.
 *   3. Cap at `maxThemes`. If more clusters than the cap, keep the largest.
 *   4. Codex names each surviving cluster (1 prompt per cluster, in
 *      parallel) given a sample of its texts.
 *   5. Back-fill the named theme onto each card's `themeTags` so the Card
 *      Forge's caller can render filtered decks ("today's work cards").
 *
 * Embedder interface mirrors the one Phase H established in
 * `apps/web/src/components/hub/shells/science-explainer/claim-search.ts`.
 * Real wiring against OpenAI happens in Phase L; tests inject a deterministic
 * mock embedder.
 *
 * Total Codex calls: 1 per surviving theme (typically 5-12 per creator).
 */

import type {
  AphorismCard,
  CodexClient,
  ThemeCollection,
} from '../types';

// ---------- Embedder interface (matches Phase H pattern) ----------

export interface Embedder {
  /** Returns one numeric vector per input text. Vectors are float arrays. */
  embed(texts: string[]): Promise<number[][]>;
}

// ---------- Cosine helpers ----------

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

function norm(a: number[]): number {
  let s = 0;
  for (const x of a) s += x * x;
  return Math.sqrt(s);
}

function cosine(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

function addInto(target: number[], src: number[]): void {
  const n = Math.min(target.length, src.length);
  for (let i = 0; i < n; i++) target[i] = (target[i] ?? 0) + (src[i] ?? 0);
}

function scale(a: number[], k: number): number[] {
  return a.map((x) => x * k);
}

// ---------- Cluster pass ----------

interface VectorItem {
  id: string;
  vector: number[];
}

interface MutableCluster {
  itemIds: string[];
  centroid: number[];
}

export interface Cluster {
  itemIds: string[];
  centroid: number[];
}

export function clusterByEmbedding(
  items: VectorItem[],
  options: { similarityThreshold: number },
): Cluster[] {
  const threshold = options.similarityThreshold;
  const clusters: MutableCluster[] = [];
  for (const item of items) {
    let bestIdx = -1;
    let bestSim = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i]!;
      const sim = cosine(item.vector, c.centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestSim >= threshold) {
      const c = clusters[bestIdx]!;
      const n = c.itemIds.length;
      // Running mean of centroid: new = old * (n / (n+1)) + item / (n+1).
      const newCentroid = scale(c.centroid, n / (n + 1));
      addInto(newCentroid, scale(item.vector, 1 / (n + 1)));
      c.centroid = newCentroid;
      c.itemIds.push(item.id);
    } else {
      clusters.push({ itemIds: [item.id], centroid: [...item.vector] });
    }
  }
  return clusters.map((c) => ({ itemIds: c.itemIds, centroid: c.centroid }));
}

// ---------- Codex theme naming ----------

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

interface ThemeCodexResponse {
  name?: string;
  description?: string;
}

async function nameCluster(
  sampleTexts: string[],
  creatorName: string,
  codex: CodexClient,
  index: number,
): Promise<{ name: string; description: string }> {
  const sample = sampleTexts.slice(0, 6).map((t) => `- ${t}`).join('\n');
  const prompt = [
    `Name a single theme for this cluster of aphorisms from ${creatorName}.`,
    'Cluster sample:',
    sample,
    '',
    'Output rules:',
    '- "name": 1-3 words, title case (e.g. "Money", "Decision making", "Work").',
    '- "description": ONE line (<= 20 words) describing what unites these lines.',
    '',
    'Format: ONE JSON object: {"name":"...","description":"..."}.',
  ].join('\n');
  const raw = await codex.run(prompt, {
    stage: 'theme_name',
    timeoutMs: 60_000,
    label: `theme-name:${index}`,
  });
  const parsed = safeJsonParse<ThemeCodexResponse>(raw);
  return {
    name: parsed?.name?.trim() || `Theme ${index + 1}`,
    description:
      parsed?.description?.trim() || 'A small group of related lines from the canon.',
  };
}

// ---------- Public API ----------

export interface ComposeThemesOptions {
  embedder: Embedder;
  codex: CodexClient;
  /** Cosine similarity above which two cards land in the same cluster. */
  similarityThreshold?: number;
  /** Hard cap on themes returned. Plan target: 5-12 per creator. */
  maxThemes?: number;
  /** Hard cap on candidate clusters (size 1) we keep — drops singletons first. */
  minClusterSize?: number;
}

export async function composeThemes(
  cards: AphorismCard[],
  opts: ComposeThemesOptions,
): Promise<ThemeCollection[]> {
  if (cards.length === 0) return [];

  const similarityThreshold = opts.similarityThreshold ?? 0.78;
  const maxThemes = opts.maxThemes ?? 12;
  const minClusterSize = opts.minClusterSize ?? 1;

  const vectors = await opts.embedder.embed(cards.map((c) => c.text));
  const items: VectorItem[] = cards.map((c, i) => ({
    id: c.id,
    vector: vectors[i] ?? [],
  }));

  const clusters = clusterByEmbedding(items, { similarityThreshold });

  // Drop too-small clusters when we have enough candidates.
  let filtered = clusters;
  if (clusters.length > maxThemes) {
    const sized = clusters.filter((c) => c.itemIds.length >= minClusterSize);
    filtered = sized.length > 0 ? sized : clusters;
  }

  // Cap to maxThemes — keep the largest clusters.
  const sortedByCount = [...filtered].sort((a, b) => b.itemIds.length - a.itemIds.length);
  const kept = sortedByCount.slice(0, maxThemes);

  // Build a card-text map for sampling.
  const textById = new Map(cards.map((c) => [c.id, c.text] as const));

  const named = await Promise.all(
    kept.map(async (cluster, i) => {
      const sampleTexts = cluster.itemIds
        .map((id) => textById.get(id))
        .filter((t): t is string => typeof t === 'string');
      const meta = await nameCluster(sampleTexts, 'this creator', opts.codex, i);
      const theme: ThemeCollection = {
        id: `theme_${i}`,
        name: meta.name,
        description: meta.description,
        cardIds: cluster.itemIds,
      };
      return theme;
    }),
  );

  // Back-fill themeTags onto each card.
  const cardById = new Map(cards.map((c) => [c.id, c] as const));
  for (const t of named) {
    for (const cardId of t.cardIds) {
      const card = cardById.get(cardId);
      if (!card) continue;
      if (!card.themeTags.includes(t.name)) card.themeTags.push(t.name);
    }
  }

  return named;
}
