'use client';

/**
 * ClaimSearchBar — the science-explainer product moment.
 *
 * Audience comes asking "does X cause Y?" and gets a verified, evidence-
 * backed answer. This component renders a search input + result list of
 * EvidenceCards ranked by cosine similarity against the query.
 *
 * Embeddings are pluggable via the `embedder` prop. In production the parent
 * component injects an OpenAI-backed embedder; in tests + dev we use the
 * deterministic `mockHashEmbedder` from claim-search.ts.
 *
 * Index is built once on first render (or when the cards array changes) and
 * cached in a ref. Queries are debounced via simple state — for a serious
 * implementation we'd swap in `use-debounce` or React.startTransition, but
 * the search is local-only so latency is negligible.
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { EvidenceCard } from '@creatorcanon/synthesis';

import {
  type Embedder,
  type IndexedCard,
  type SearchHit,
  indexEvidenceCards,
  mockHashEmbedder,
  searchClaims,
} from './claim-search';

export interface ClaimSearchBarProps {
  cards: EvidenceCard[];
  /** Build href for a result; default: /claim/[card.id]. */
  hrefForCard?: (card: EvidenceCard) => string;
  /** Inject a custom embedder; defaults to mockHashEmbedder for dev. */
  embedder?: Embedder;
  topN?: number;
  primaryColor?: string;
}

const VERDICT_BADGE: Record<EvidenceCard['verdict'], { label: string; color: string }> = {
  supported: { label: 'Supported', color: '#0a7c3a' },
  partially_supported: { label: 'Partially supported', color: '#a06200' },
  contradicted: { label: 'Contradicted', color: '#a01a1a' },
  mixed: { label: 'Mixed', color: '#555' },
};

export function ClaimSearchBar({
  cards,
  hrefForCard,
  embedder,
  topN = 3,
  primaryColor = '#111',
}: ClaimSearchBarProps) {
  const resolvedEmbedder = useMemo<Embedder>(
    () => embedder ?? mockHashEmbedder(64),
    [embedder],
  );
  const indexRef = useRef<IndexedCard[] | null>(null);
  const [indexReady, setIndexReady] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [pending, setPending] = useState(false);

  // Build index once per (cards, embedder) tuple.
  useEffect(() => {
    let cancelled = false;
    indexRef.current = null;
    setIndexReady(false);
    void (async () => {
      const idx = await indexEvidenceCards(cards, resolvedEmbedder);
      if (cancelled) return;
      indexRef.current = idx;
      setIndexReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cards, resolvedEmbedder]);

  useEffect(() => {
    if (!indexReady) return;
    if (query.trim().length === 0) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setPending(true);
    void (async () => {
      const results = await searchClaims(
        query,
        indexRef.current ?? [],
        resolvedEmbedder,
        topN,
      );
      if (cancelled) return;
      setHits(results);
      setPending(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [query, indexReady, resolvedEmbedder, topN]);

  const resolveHref = hrefForCard ?? ((c: EvidenceCard) => `/claim/${c.id}`);

  return (
    <div style={{ width: '100%' }}>
      <label
        htmlFor="claim-search"
        style={{
          display: 'block',
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 8,
          color: '#222',
        }}
      >
        Ask a question — does X cause Y? what does the data say?
      </label>
      <input
        id="claim-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. do seed oils cause inflammation?"
        autoComplete="off"
        style={{
          width: '100%',
          padding: '14px 16px',
          fontSize: 16,
          border: `2px solid ${primaryColor}`,
          borderRadius: 10,
          outline: 'none',
        }}
      />
      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: 16, minHeight: 24, color: '#666', fontSize: 13 }}
      >
        {!indexReady
          ? 'Indexing claims…'
          : pending
            ? 'Searching…'
            : query.trim().length === 0
              ? `Ready. ${cards.length} claim${cards.length === 1 ? '' : 's'} in this library.`
              : hits.length === 0
                ? 'No matching claims yet — try rephrasing.'
                : `Top ${hits.length} match${hits.length === 1 ? '' : 'es'}.`}
      </div>
      {hits.length > 0 ? (
        <ul style={{ marginTop: 12, padding: 0, listStyle: 'none' }}>
          {hits.map(({ card, score }) => {
            const badge = VERDICT_BADGE[card.verdict];
            return (
              <li
                key={card.id}
                style={{
                  marginBottom: 12,
                  padding: 16,
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                }}
              >
                <Link
                  href={resolveHref(card)}
                  style={{ textDecoration: 'none', color: '#111' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        color: badge.color,
                      }}
                    >
                      {badge.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#999' }}>
                      score {score.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {card.claim}
                  </div>
                  <div style={{ fontSize: 14, color: '#444' }}>
                    {card.mechanismExplanation}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
