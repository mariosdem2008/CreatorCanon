import Link from 'next/link';

import { ClaimSearchBar } from '../ClaimSearchBar';
import type { HomePageProps } from '../data-adapter';

/**
 * Science-explainer home — claim-search-first landing.
 * Phase H scope: minimal styling to prove pattern. Polish lands later.
 */
export function HomePage({
  data,
  primaryColor,
  hrefForCard,
}: {
  data: HomePageProps;
  primaryColor: string;
  hrefForCard?: (cardId: string) => string;
}) {
  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '64px 24px',
        fontFamily: 'system-ui',
      }}
    >
      <section style={{ marginBottom: 48 }}>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 700,
            marginBottom: 16,
            lineHeight: 1.15,
          }}
        >
          {data.heroHeadline}
        </h1>
        <p style={{ fontSize: 18, color: '#444', marginBottom: 32 }}>
          {data.heroSubcopy}
        </p>
        <ClaimSearchBar
          cards={data.cards}
          primaryColor={primaryColor}
          hrefForCard={
            hrefForCard ? (c) => hrefForCard(c.id) : undefined
          }
          topN={5}
        />
      </section>

      {Object.keys(data.topicIndex).length > 0 ? (
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>
            Browse by topic
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(data.topicIndex).map(([topic, ids]) => (
              <li key={topic}>
                <Link
                  href={`/topic/${topic}`}
                  style={{
                    display: 'inline-block',
                    padding: '8px 14px',
                    border: '1px solid #ddd',
                    borderRadius: 999,
                    color: '#222',
                    textDecoration: 'none',
                    fontSize: 14,
                  }}
                >
                  {topic.replace(/-/g, ' ')} ({ids.length})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.funnel.emailCapture ? (
        <section
          style={{
            marginBottom: 32,
            padding: 24,
            background: '#f7f7f8',
            borderRadius: 12,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
            {data.funnel.emailCapture.label}
          </h2>
          <form style={{ display: 'flex', gap: 8 }}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
              }}
            />
            <button
              type="submit"
              style={{
                padding: '10px 16px',
                background: primaryColor,
                color: '#fff',
                borderRadius: 6,
                fontWeight: 600,
                border: 'none',
              }}
            >
              {data.funnel.emailCapture.submitText}
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
