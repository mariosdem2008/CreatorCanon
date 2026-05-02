import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { formatCreatorManualTimestamp } from '@/lib/hub/creator-manual/evidence';
import { getCreatorManualSegmentRoute, getCreatorManualSourceRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';

export function CreatorManualSegments({ manifest, index }: { manifest: CreatorManualManifest; index: CreatorManualIndex }) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>Timestamped moments</div>
        <h1 className={styles.pageTitle}>Segments</h1>
        <p className={styles.subtitle}>Source moments that carry claims, examples, vocabulary, and operating context.</p>
      </section>
      <section className={styles.section}>
        {manifest.segments.length > 0 ? (
          <div className={styles.grid}>
            {manifest.segments.map((segment) => {
              const source = index.sourcesById.get(segment.sourceId);
              return (
                <article key={segment.id} className={styles.recordCard}>
                  <span className={styles.timestamp}>
                    {formatCreatorManualTimestamp(segment.timestampStart)}-{formatCreatorManualTimestamp(segment.timestampEnd)}
                  </span>
                  <h2 className={styles.cardTitle}>{segment.title}</h2>
                  <p className={styles.cardBody}>{segment.summary}</p>
                  <div className={styles.tagRow}>
                    {source ? (
                      <Link href={getCreatorManualSourceRoute(manifest.hubSlug, source.id)} className={styles.secondaryButton}>
                        {source.title}
                      </Link>
                    ) : (
                      <span className={styles.tag}>Missing source</span>
                    )}
                    <span className={styles.tag}>{segment.claimIds.length} claims</span>
                    <Link href={getCreatorManualSegmentRoute(manifest.hubSlug, segment.id)} className={styles.button}>
                      Open segment
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>No segments are published yet.</div>
        )}
      </section>
    </>
  );
}
