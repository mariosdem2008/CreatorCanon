import Link from 'next/link';

import type { GlossaryPageProps } from '../data-adapter';

/**
 * Glossary index + single-term detail. Renders the index view by default,
 * and a single-term detail when termId is provided.
 */
export function GlossaryPage({
  data,
  termId,
  primaryColor,
}: {
  data: GlossaryPageProps;
  termId?: string;
  primaryColor: string;
}) {
  if (termId) {
    const entry = data.entryById[termId];
    if (!entry) {
      return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
          <p>Term not found.</p>
          <Link href="/glossary" style={{ color: primaryColor }}>
            Back to glossary
          </Link>
        </main>
      );
    }
    return (
      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '64px 24px',
          fontFamily: 'system-ui',
        }}
      >
        <Link href="/glossary" style={{ color: primaryColor, fontSize: 14 }}>
          &larr; All terms
        </Link>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginTop: 16, marginBottom: 12 }}>
          {entry.term}
        </h1>
        <p style={{ fontSize: 17, color: '#222', lineHeight: 1.55, marginBottom: 24 }}>
          {entry.definition}
        </p>
        {entry.appearsInCanonIds.length > 0 ? (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Appears in
            </h2>
            <ul style={{ paddingLeft: 20, color: '#444' }}>
              {entry.appearsInCanonIds.map((id) => (
                <li key={id}>
                  <Link href={`/study/${id}`} style={{ color: primaryColor }}>
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    );
  }

  // Group entries alphabetically.
  const grouped = new Map<string, typeof data.entries>();
  for (const entry of data.entries) {
    const letter = (entry.term[0] ?? '?').toUpperCase();
    const list = grouped.get(letter) ?? [];
    list.push(entry);
    grouped.set(letter, list);
  }
  const letters = [...grouped.keys()].sort();

  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '64px 24px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>Glossary</h1>
      <p style={{ color: '#444', marginBottom: 32 }}>
        Mechanisms and terms used across this library.
      </p>
      {data.entries.length === 0 ? (
        <p style={{ color: '#666' }}>No terms extracted yet.</p>
      ) : (
        letters.map((letter) => (
          <section key={letter} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: '#666', marginBottom: 8 }}>
              {letter}
            </h2>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {(grouped.get(letter) ?? []).map((entry) => (
                <li key={entry.id} style={{ marginBottom: 6 }}>
                  <Link
                    href={`/glossary/${entry.id}`}
                    style={{ color: primaryColor, fontWeight: 600 }}
                  >
                    {entry.term}
                  </Link>{' '}
                  <span style={{ color: '#666' }}>— {entry.definition.split('.')[0]}.</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}
