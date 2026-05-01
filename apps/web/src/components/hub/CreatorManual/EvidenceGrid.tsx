import { resolveEvidenceReferences } from '@/lib/hub/creator-manual/evidence';
import type {
  CreatorManualEvidenceRef,
  CreatorManualManifest,
} from '@/lib/hub/creator-manual/schema';

import { CitationDrawer } from './CitationDrawer';
import styles from './CreatorManual.module.css';
import { MiniEvidenceVideo } from './MiniEvidenceVideo';
import { creatorManualCardStyle } from './visualStyle';

type EvidenceGridProps = {
  manifest: CreatorManualManifest;
  refs: CreatorManualEvidenceRef[];
  title?: string;
  emptyLabel?: string;
};

export function EvidenceGrid({
  manifest,
  refs,
  title = manifest.brand.labels.evidence ?? 'Evidence',
  emptyLabel = 'No public evidence is linked yet.',
}: EvidenceGridProps) {
  const evidence = resolveEvidenceReferences(manifest, refs).filter((item) => item.source);

  if (evidence.length === 0) {
    return (
      <section className={styles.section} aria-label={title}>
        <div className={styles.empty}>{emptyLabel}</div>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.tag}>{evidence.length} source moments</span>
      </div>
      <div className={styles.evidenceGrid}>
        {evidence.map((item, index) => {
          const timestampStart = item.ref.timestampStart ?? item.segment?.timestampStart ?? 0;
          return (
            <article
              key={`${item.ref.sourceId}-${item.ref.segmentId ?? 'source'}-${index}`}
              className={styles.evidenceCard}
              style={creatorManualCardStyle({ index })}
            >
              {item.source ? (
                <MiniEvidenceVideo source={item.source} timestampStart={timestampStart} />
              ) : null}
              <div>
                <div className={styles.tagRow}>
                  {item.timestampLabel ? (
                    <span className={styles.timestamp}>{item.timestampLabel}</span>
                  ) : null}
                  {item.source ? <span className={styles.tag}>{item.source.platform}</span> : null}
                </div>
                <h3 className={styles.cardTitle}>
                  {item.segment?.title ?? item.source?.title ?? 'Source evidence'}
                </h3>
                <p className={styles.cardBody}>
                  {item.segment?.summary ??
                    item.ref.note ??
                    item.source?.summary ??
                    'Source context unavailable.'}
                </p>
              </div>
              {item.segment ? (
                <p className={styles.cardBody}>{item.segment.transcriptExcerpt}</p>
              ) : null}
              <div className={styles.tagRow}>
                <CitationDrawer evidence={item} />
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.secondaryButton}
                  >
                    Open source
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
