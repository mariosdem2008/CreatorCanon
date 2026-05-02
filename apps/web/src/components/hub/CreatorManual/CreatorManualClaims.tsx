import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getNodesByIds } from '@/lib/hub/creator-manual/content';
import { getCreatorManualLibraryRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualClaim, CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import { EvidenceGrid } from './EvidenceGrid';
import styles from './CreatorManual.module.css';

const confidenceClass = (claim: CreatorManualClaim) =>
  claim.confidence === 'strong'
    ? `${styles.confidence} ${styles.confidenceStrong}`
    : claim.confidence === 'developing'
      ? `${styles.confidence} ${styles.confidenceDeveloping}`
      : styles.confidence;

export function CreatorManualClaims({ manifest, index }: { manifest: CreatorManualManifest; index: CreatorManualIndex }) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>Evidence-backed statements</div>
        <h1 className={styles.pageTitle}>Claims</h1>
        <p className={styles.subtitle}>Precise statements from the manual with visible confidence and citation support.</p>
      </section>
      <section className={styles.section}>
        {manifest.claims.length > 0 ? (
          <div className={styles.list}>
            {manifest.claims.map((claim) => {
              const nodes = getNodesByIds(index, claim.relatedNodeIds);
              return (
                <article key={claim.id} id={claim.id} className={styles.listItem}>
                  <div className={styles.tagRow}>
                    <span className={confidenceClass(claim)}>{claim.confidence}</span>
                    <span className={styles.tag}>{claim.evidence.length} evidence</span>
                  </div>
                  <h2 className={styles.cardTitle}>{claim.title}</h2>
                  <p className={styles.prose}>{claim.statement}</p>
                  <div className={styles.tagRow}>
                    {nodes.map((node) => (
                      <Link key={node.id} href={`${getCreatorManualLibraryRoute(manifest.hubSlug)}#${node.slug}`} className={styles.secondaryButton}>
                        {node.title}
                      </Link>
                    ))}
                  </div>
                  <EvidenceGrid manifest={manifest} refs={claim.evidence} emptyLabel="This claim has no public evidence yet." />
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>No claims are published yet.</div>
        )}
      </section>
    </>
  );
}
