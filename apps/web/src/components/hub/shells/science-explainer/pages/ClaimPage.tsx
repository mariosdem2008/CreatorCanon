import Link from 'next/link';

import type { EvidenceCard } from '@creatorcanon/synthesis';

import type { ClaimPageProps } from '../data-adapter';

const VERDICT_BADGE: Record<EvidenceCard['verdict'], { label: string; color: string; symbol: string }> = {
  supported: { label: 'Supported', color: '#0a7c3a', symbol: '✓' },
  partially_supported: { label: 'Partially supported', color: '#a06200', symbol: '!' },
  contradicted: { label: 'Contradicted', color: '#a01a1a', symbol: '✗' },
  mixed: { label: 'Mixed', color: '#555', symbol: '?' },
};

export interface ClaimDetailPageProps {
  data: ClaimPageProps;
  cardId: string;
  primaryColor: string;
  hrefForStudy?: (canonId: string) => string;
}

/**
 * Single claim with verdict + evidence cards. The audience lands here from
 * search ("does X cause Y?"). The verdict badge dominates the top so a
 * scanning reader knows the answer in 2 seconds.
 */
export function ClaimPage({ data, cardId, primaryColor, hrefForStudy }: ClaimDetailPageProps) {
  const card = data.cardById[cardId];
  if (!card) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
        <p>Claim not found.</p>
        <Link href="/" style={{ color: primaryColor }}>
          Back to search
        </Link>
      </main>
    );
  }

  const badge = VERDICT_BADGE[card.verdict];

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px',
        fontFamily: 'system-ui',
      }}
    >
      <Link href="/" style={{ color: primaryColor, fontSize: 14 }}>
        &larr; Back to search
      </Link>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 24,
          padding: '8px 14px',
          borderRadius: 999,
          background: badge.color,
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        <span aria-hidden>{badge.symbol}</span> {badge.label}
      </div>

      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          marginTop: 16,
          marginBottom: 16,
          lineHeight: 1.2,
        }}
      >
        {card.claim}
      </h1>

      <p style={{ fontSize: 17, color: '#222', lineHeight: 1.55, marginBottom: 32 }}>
        {card.mechanismExplanation}
      </p>

      {card.caveats.length > 0 ? (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Caveats</h2>
          <ul style={{ paddingLeft: 20, color: '#444' }}>
            {card.caveats.map((c, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {c}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.studyEvidenceCanonIds.length > 0 ? (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Evidence
          </h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {card.studyEvidenceCanonIds.map((canonId) => (
              <li key={canonId} style={{ marginBottom: 6 }}>
                <Link
                  href={hrefForStudy ? hrefForStudy(canonId) : `/study/${canonId}`}
                  style={{ color: primaryColor, textDecoration: 'underline' }}
                >
                  Study: {canonId}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.counterClaim ? (
        <aside
          style={{
            marginBottom: 32,
            padding: 16,
            background: '#fff8eb',
            border: '1px solid #f3e0a8',
            borderRadius: 10,
          }}
        >
          <strong style={{ display: 'block', marginBottom: 6 }}>Counter-claim</strong>
          <p style={{ margin: 0, color: '#5a4400' }}>{card.counterClaim}</p>
        </aside>
      ) : null}

      <button
        type="button"
        style={{
          padding: '12px 18px',
          background: primaryColor,
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Share this claim
      </button>
    </main>
  );
}
