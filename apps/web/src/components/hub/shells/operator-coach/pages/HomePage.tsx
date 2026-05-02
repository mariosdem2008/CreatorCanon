import Link from 'next/link';

import type { HomePageProps } from '../data-adapter';

/**
 * Operator-coach home — diagnostic landing + action-plan hero.
 * Phase A: minimal styling to prove pattern; Phase B/D adds polish + theming.
 */
export function HomePage({
  data,
  primaryColor,
  actionPlanHref,
}: {
  data: HomePageProps;
  primaryColor: string;
  actionPlanHref: string;
}) {
  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '64px 24px', fontFamily: 'system-ui' }}>
      <section style={{ marginBottom: 64 }}>
        <h1 style={{ fontSize: 40, fontWeight: 700, marginBottom: 16, lineHeight: 1.15 }}>
          {data.heroHeadline}
        </h1>
        <p style={{ fontSize: 18, color: '#444', marginBottom: 24 }}>{data.heroSubcopy}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link
            href={actionPlanHref}
            style={{
              display: 'inline-block',
              padding: '14px 24px',
              background: primaryColor,
              color: '#fff',
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Start the action plan
          </Link>
          {data.primaryCta ? (
            <Link
              href={data.primaryCta.href}
              style={{
                display: 'inline-block',
                padding: '14px 24px',
                border: '1px solid #ccc',
                color: '#222',
                borderRadius: 8,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              {data.primaryCta.label}
            </Link>
          ) : null}
        </div>
      </section>

      {data.diagnostic ? (
        <section
          style={{ marginBottom: 64, padding: 24, border: '1px solid #e5e7eb', borderRadius: 12 }}
        >
          <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Find your next move</h2>
          <p style={{ color: '#444', marginBottom: 16 }}>{data.diagnostic.intro}</p>
          <p style={{ color: '#666' }}>
            {data.diagnostic.questions.length} questions, ~2 minutes.
          </p>
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
