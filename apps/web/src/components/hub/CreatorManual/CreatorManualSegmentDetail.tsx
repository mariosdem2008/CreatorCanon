import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getClaimsByIds, getNodesByIds } from '@/lib/hub/creator-manual/content';
import { formatCreatorManualTimestamp } from '@/lib/hub/creator-manual/evidence';
import { getCreatorManualClaimRoute, getCreatorManualLibraryRoute, getCreatorManualSourceRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest, CreatorManualSegment } from '@/lib/hub/creator-manual/schema';

import { EvidenceGrid } from './EvidenceGrid';
import styles from './CreatorManual.module.css';
import { MiniEvidenceVideo } from './MiniEvidenceVideo';

export function CreatorManualSegmentDetail({
  manifest,
  index,
  segment,
}: {
  manifest: CreatorManualManifest;
  index: CreatorManualIndex;
  segment: CreatorManualSegment;
}) {
  const source = index.sourcesById.get(segment.sourceId) ?? null;
  const nodes = getNodesByIds(index, segment.nodeIds);
  const claims = getClaimsByIds(index, segment.claimIds);

  return (
    <>
      <section className={styles.twoColumn}>
        <div>
          <div className={styles.eyebrow}>Segment</div>
          <h1 className={styles.pageTitle}>{segment.title}</h1>
          <p className={styles.subtitle}>{segment.summary}</p>
          <div className={styles.tagRow}>
            <span className={styles.timestamp}>
              {formatCreatorManualTimestamp(segment.timestampStart)}-{formatCreatorManualTimestamp(segment.timestampEnd)}
            </span>
            {source ? (
              <Link href={getCreatorManualSourceRoute(manifest.hubSlug, source.id)} className={styles.secondaryButton}>
                {source.title}
              </Link>
            ) : (
              <span className={styles.tag}>Missing source</span>
            )}
          </div>
        </div>
        {source ? <MiniEvidenceVideo source={source} timestampStart={segment.timestampStart} /> : null}
      </section>

      <section className={styles.section}>
        <div className={styles.detailBlock}>
          <div className={styles.label}>Transcript excerpt</div>
          <p className={styles.prose}>{segment.transcriptExcerpt}</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Related records</h2>
        </div>
        <div className={styles.denseGrid}>
          {nodes.map((node) => (
            <Link key={node.id} href={`${getCreatorManualLibraryRoute(manifest.hubSlug)}#${node.slug}`} className={styles.recordCard}>
              <span className={styles.tag}>{node.type}</span>
              <h3 className={styles.cardTitle}>{node.title}</h3>
            </Link>
          ))}
          {claims.map((claim) => (
            <Link key={claim.id} href={getCreatorManualClaimRoute(manifest.hubSlug, claim.id)} className={styles.recordCard}>
              <span className={styles.tag}>claim</span>
              <h3 className={styles.cardTitle}>{claim.title}</h3>
            </Link>
          ))}
        </div>
      </section>

      <EvidenceGrid
        manifest={manifest}
        refs={[{ sourceId: segment.sourceId, segmentId: segment.id, timestampStart: segment.timestampStart, timestampEnd: segment.timestampEnd }]}
      />
    </>
  );
}
