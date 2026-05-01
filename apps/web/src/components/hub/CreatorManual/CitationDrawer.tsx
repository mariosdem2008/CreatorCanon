'use client';

import { useId, useState } from 'react';

import type { ResolvedCreatorManualEvidence } from '@/lib/hub/creator-manual/evidence';

import styles from './CreatorManual.module.css';

type CitationDrawerProps = {
  evidence: ResolvedCreatorManualEvidence;
};

export function CitationDrawer({ evidence }: CitationDrawerProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const sourceTitle = evidence.source?.title ?? 'Missing source';

  return (
    <>
      <button type="button" className={styles.secondaryButton} onClick={() => setOpen(true)}>
        Citation
      </button>
      {open ? (
        <>
          <button
            type="button"
            className={styles.drawerOverlay}
            aria-label="Close citation drawer"
            onClick={() => setOpen(false)}
          />
          <aside className={styles.drawerPanel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.eyebrow}>Citation packet</div>
                <h2 id={titleId} className={styles.sectionTitle}>{sourceTitle}</h2>
              </div>
              <button type="button" className={styles.secondaryButton} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <dl className={styles.sourceMeta}>
              <div className={styles.sourceMetaItem}>
                <dt className={styles.label}>Timestamp</dt>
                <dd>{evidence.timestampLabel ?? 'Unknown'}</dd>
              </div>
              <div className={styles.sourceMetaItem}>
                <dt className={styles.label}>Source ID</dt>
                <dd>{evidence.ref.sourceId}</dd>
              </div>
              {evidence.ref.segmentId ? (
                <div className={styles.sourceMetaItem}>
                  <dt className={styles.label}>Segment ID</dt>
                  <dd>{evidence.ref.segmentId}</dd>
                </div>
              ) : null}
            </dl>
            {evidence.ref.note ? <p className={styles.prose}>{evidence.ref.note}</p> : null}
            {evidence.segment ? (
              <blockquote className={styles.detailBlock}>
                <div className={styles.label}>Transcript excerpt</div>
                <p className={styles.prose}>{evidence.segment.transcriptExcerpt}</p>
              </blockquote>
            ) : null}
            {evidence.url ? (
              <a href={evidence.url} target="_blank" rel="noreferrer" className={styles.button}>
                Open source
              </a>
            ) : null}
          </aside>
        </>
      ) : null}
    </>
  );
}
