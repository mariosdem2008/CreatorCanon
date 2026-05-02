import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getClaimsByIds, getNodesByIds } from '@/lib/hub/creator-manual/content';
import { getCreatorManualClaimRoute, getCreatorManualLibraryRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest, CreatorManualPillar } from '@/lib/hub/creator-manual/schema';

import { EvidenceGrid } from './EvidenceGrid';
import styles from './CreatorManual.module.css';

type CreatorManualPillarDetailProps = {
  manifest: CreatorManualManifest;
  index: CreatorManualIndex;
  pillar: CreatorManualPillar;
};

export function CreatorManualPillarDetail({ manifest, index, pillar }: CreatorManualPillarDetailProps) {
  const nodes = getNodesByIds(index, pillar.nodeIds);
  const claims = getClaimsByIds(index, pillar.claimIds);

  return (
    <>
      <section>
        <div className={styles.eyebrow}>Pillar</div>
        <h1 className={styles.pageTitle}>{pillar.title}</h1>
        <p className={styles.subtitle}>{pillar.description}</p>
        <div className={styles.tagRow}>
          <span className={styles.tag}>{nodes.length} nodes</span>
          <span className={styles.tag}>{claims.length} claims</span>
          <span className={styles.tag}>{pillar.evidence.length} evidence</span>
        </div>
      </section>

      {pillar.sections?.length ? (
        <section className={styles.section}>
          <div className={styles.twoColumn}>
            <div className={styles.prose}>
              {pillar.sections.map((section) => (
                <section key={section.title} className={styles.detailBlock}>
                  <h2>{section.title}</h2>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
            <aside>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Related claims</h2>
              </div>
              <ul className={styles.list}>
                {claims.map((claim) => (
                  <li key={claim.id} className={styles.listItem}>
                    <Link href={getCreatorManualClaimRoute(manifest.hubSlug, claim.id)}>{claim.title}</Link>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Related nodes</h2>
          <span className={styles.tag}>{nodes.length}</span>
        </div>
        {nodes.length > 0 ? (
          <div className={styles.denseGrid}>
            {nodes.map((node) => (
              <Link key={node.id} href={`${getCreatorManualLibraryRoute(manifest.hubSlug)}#${node.slug}`} className={styles.recordCard}>
                <span className={styles.tag}>{node.type}</span>
                <h3 className={styles.cardTitle}>{node.title}</h3>
                <p className={styles.cardBody}>{node.summary}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No related nodes are published for this pillar.</div>
        )}
      </section>

      <EvidenceGrid manifest={manifest} refs={pillar.evidence} />
    </>
  );
}
