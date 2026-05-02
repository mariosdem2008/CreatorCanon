import Link from 'next/link';

import type { DebunkingPageProps } from '../data-adapter';

/**
 * Debunking index + single-myth detail. Index is rendered when itemId is
 * undefined; otherwise the myth/reality detail view is rendered.
 */
export function DebunkingPage({
  data,
  itemId,
  primaryColor,
}: {
  data: DebunkingPageProps;
  itemId?: string;
  primaryColor: string;
}) {
  if (itemId) {
    const item = data.itemById[itemId];
    if (!item) {
      return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px' }}>
          <p>Myth not found.</p>
          <Link href="/debunking" style={{ color: primaryColor }}>
            Back to debunkings
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
        <Link href="/debunking" style={{ color: primaryColor, fontSize: 14 }}>
          &larr; All debunkings
        </Link>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 24,
            padding: '8px 14px',
            borderRadius: 999,
            background: '#a01a1a',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Myth
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 12, marginBottom: 24 }}>
          {item.myth}
        </h1>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 999,
            background: '#0a7c3a',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Reality
        </div>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: '#222',
            marginTop: 12,
            marginBottom: 32,
          }}
        >
          {item.reality}
        </p>

        {item.primaryEvidenceCanonIds.length > 0 ? (
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Evidence</h2>
            <ul style={{ paddingLeft: 20, color: '#444' }}>
              {item.primaryEvidenceCanonIds.map((id) => (
                <li key={id}>
                  <Link href={`/study/${id}`} style={{ color: primaryColor }}>
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
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
          Share this debunking
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '64px 24px',
        fontFamily: 'system-ui',
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>Debunkings</h1>
      <p style={{ color: '#444', marginBottom: 32 }}>
        Common myths, paired with the evidence that pushes back.
      </p>
      {data.items.length === 0 ? (
        <p style={{ color: '#666' }}>No debunkings authored yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {data.items.map((item) => (
            <li
              key={item.id}
              style={{
                marginBottom: 16,
                padding: 16,
                border: '1px solid #e5e7eb',
                borderRadius: 10,
              }}
            >
              <Link
                href={`/debunking/${item.id}`}
                style={{ textDecoration: 'none', color: '#111' }}
              >
                <div style={{ fontSize: 12, color: '#a01a1a', fontWeight: 700, marginBottom: 4 }}>
                  Myth
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                  {item.myth}
                </div>
                <div style={{ fontSize: 14, color: '#444' }}>{item.reality}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
