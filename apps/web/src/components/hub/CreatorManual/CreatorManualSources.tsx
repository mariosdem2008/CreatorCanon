import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { formatCreatorManualTimestamp } from '@/lib/hub/creator-manual/evidence';
import { getCreatorManualSourceRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';
import { creatorManualCardStyle } from './visualStyle';

const formatDate = (value: string | null) => {
  if (!value) return 'Undated';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Undated'
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export function CreatorManualSources({
  manifest,
}: {
  manifest: CreatorManualManifest;
  index?: CreatorManualIndex;
}) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>Evidence inventory</div>
        <h1 className={styles.pageTitle}>Sources</h1>
        <p className={styles.subtitle}>
          Original videos and source assets used to ground the manual.
        </p>
      </section>
      <section className={styles.section}>
        {manifest.sources.length > 0 ? (
          <div className={styles.grid}>
            {manifest.sources.map((source, index) => (
              <Link
                key={source.id}
                href={getCreatorManualSourceRoute(manifest.hubSlug, source.id)}
                className={styles.recordCard}
                style={creatorManualCardStyle({ index })}
              >
                <div className={styles.tagRow}>
                  <span className={styles.tag}>{source.platform}</span>
                  <span className={styles.tag}>{source.segmentIds.length} segments</span>
                </div>
                <h2 className={styles.cardTitle}>{source.title}</h2>
                <p className={styles.cardBody}>{source.summary}</p>
                <div className={styles.sourceMeta}>
                  <span className={styles.sourceMetaItem}>{formatDate(source.publishedAt)}</span>
                  <span className={styles.sourceMetaItem}>
                    {source.durationSec
                      ? formatCreatorManualTimestamp(source.durationSec)
                      : 'Duration unknown'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No source records are published yet.</div>
        )}
      </section>
    </>
  );
}
