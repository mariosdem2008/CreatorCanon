import Link from 'next/link';

import type { StudyPageProps } from '../data-adapter';

/**
 * Single-study deep-dive page. Phase H scope: a stub that lists the
 * evidence cards backing a given study (canon id). Real per-study
 * structured data (DOI, sample size, etc.) becomes its own concern when
 * Phase L lands the study extraction pipeline.
 */
export function StudyPage({
  data,
  studyCanonId,
  primaryColor,
}: {
  data: StudyPageProps;
  studyCanonId: string;
  primaryColor: string;
}) {
  const linkedCards = data.cards.filter((c) =>
    c.studyEvidenceCanonIds.includes(studyCanonId),
  );

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

      <h1 style={{ fontSize: 30, fontWeight: 700, marginTop: 24, marginBottom: 8 }}>
        Study: {studyCanonId}
      </h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        Source canon node from the creator&apos;s library.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        Claims that cite this study
      </h2>

      {linkedCards.length === 0 ? (
        <p style={{ color: '#666' }}>No claims reference this study yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {linkedCards.map((card) => (
            <li key={card.id} style={{ marginBottom: 12 }}>
              <Link
                href={`/claim/${card.id}`}
                style={{ color: primaryColor, fontWeight: 600 }}
              >
                {card.claim}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
