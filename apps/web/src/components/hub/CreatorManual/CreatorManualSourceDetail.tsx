import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getSegmentsForSource } from '@/lib/hub/creator-manual/content';
import { formatCreatorManualTimestamp } from '@/lib/hub/creator-manual/evidence';
import { getCreatorManualSegmentRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest, CreatorManualSource } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';
import { MiniEvidenceVideo } from './MiniEvidenceVideo';

type CreatorManualSourceDetailProps = {
  manifest: CreatorManualManifest;
  index: CreatorManualIndex;
  source: CreatorManualSource;
};

export function CreatorManualSourceDetail({ manifest, index, source }: CreatorManualSourceDetailProps) {
  const segments = getSegmentsForSource(index, source.id);

  return (
    <>
      <section className={styles.twoColumn}>
        <div>
          <div className={styles.eyebrow}>{source.platform} source</div>
          <h1 className={styles.pageTitle}>{source.title}</h1>
          <p className={styles.subtitle}>{source.summary}</p>
          <dl className={styles.sourceMeta}>
            <div className={styles.sourceMetaItem}>
              <dt className={styles.label}>Creator</dt>
              <dd>{source.creatorName}</dd>
            </div>
            <div className={styles.sourceMetaItem}>
              <dt className={styles.label}>Duration</dt>
              <dd>{source.durationSec ? formatCreatorManualTimestamp(source.durationSec) : 'Unknown'}</dd>
            </div>
            <div className={styles.sourceMetaItem}>
              <dt className={styles.label}>Segments</dt>
              <dd>{segments.length}</dd>
            </div>
          </dl>
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer" className={styles.button}>
              Open original
            </a>
          ) : null}
        </div>
        <MiniEvidenceVideo source={source} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Segments</h2>
          <span className={styles.tag}>{segments.length}</span>
        </div>
        {segments.length > 0 ? (
          <div className={styles.grid}>
            {segments.map((segment) => (
              <Link key={segment.id} href={getCreatorManualSegmentRoute(manifest.hubSlug, segment.id)} className={styles.recordCard}>
                <span className={styles.timestamp}>
                  {formatCreatorManualTimestamp(segment.timestampStart)}-{formatCreatorManualTimestamp(segment.timestampEnd)}
                </span>
                <h3 className={styles.cardTitle}>{segment.title}</h3>
                <p className={styles.cardBody}>{segment.summary}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No public segments are linked to this source.</div>
        )}
      </section>
    </>
  );
}
