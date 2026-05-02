import Link from 'next/link';

import type { TopicPageProps } from '../data-adapter';

/**
 * Topic page — claims grouped by topic. Renders the topic index when
 * topicSlug is undefined; otherwise renders all cards in that topic.
 */
export function TopicPage({
  data,
  topicSlug,
  primaryColor,
}: {
  data: TopicPageProps;
  topicSlug?: string;
  primaryColor: string;
}) {
  if (topicSlug) {
    const cardIds = data.topicIndex[topicSlug] ?? [];
    const cards = cardIds
      .map((id) => data.cardById[id])
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    return (
      <main
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: '64px 24px',
          fontFamily: 'system-ui',
        }}
      >
        <Link href="/topic" style={{ color: primaryColor, fontSize: 14 }}>
          &larr; All topics
        </Link>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            marginTop: 16,
            marginBottom: 24,
            textTransform: 'capitalize',
          }}
        >
          {topicSlug.replace(/-/g, ' ')}
        </h1>
        {cards.length === 0 ? (
          <p style={{ color: '#666' }}>No claims in this topic yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {cards.map((card) => (
              <li
                key={card.id}
                style={{
                  marginBottom: 12,
                  padding: 14,
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                }}
              >
                <Link
                  href={`/claim/${card.id}`}
                  style={{ color: '#111', textDecoration: 'none' }}
                >
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                    {card.verdict}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{card.claim}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  const topics = Object.entries(data.topicIndex).sort();

  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '64px 24px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>Topics</h1>
      <p style={{ color: '#444', marginBottom: 32 }}>
        Claims grouped by topic.
      </p>
      {topics.length === 0 ? (
        <p style={{ color: '#666' }}>No topics yet.</p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {topics.map(([slug, ids]) => (
            <li
              key={slug}
              style={{
                padding: 16,
                border: '1px solid #e5e7eb',
                borderRadius: 10,
              }}
            >
              <Link
                href={`/topic/${slug}`}
                style={{
                  color: '#111',
                  textDecoration: 'none',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              >
                {slug.replace(/-/g, ' ')}
              </Link>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {ids.length} claim{ids.length === 1 ? '' : 's'}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
