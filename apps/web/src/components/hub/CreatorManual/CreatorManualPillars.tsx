import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';
import { getCreatorManualPillarRoute } from '@/lib/hub/creator-manual/routes';

import styles from './CreatorManual.module.css';

export function CreatorManualPillars({ manifest }: { manifest: CreatorManualManifest; index?: CreatorManualIndex }) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>Field manual structure</div>
        <h1 className={styles.pageTitle}>Pillars</h1>
        <p className={styles.subtitle}>The creator system grouped into source-backed operating principles.</p>
      </section>
      <section className={styles.section}>
        {manifest.pillars.length > 0 ? (
          <div className={styles.grid}>
            {manifest.pillars.map((pillar) => (
              <Link key={pillar.id} href={getCreatorManualPillarRoute(manifest.hubSlug, pillar.slug)} className={styles.recordCard}>
                <span className={styles.tag}>{pillar.evidence.length} evidence</span>
                <h2 className={styles.cardTitle}>{pillar.title}</h2>
                <p className={styles.cardBody}>{pillar.summary}</p>
                <div className={styles.tagRow}>
                  <span className={styles.tag}>{pillar.nodeIds.length} nodes</span>
                  <span className={styles.tag}>{pillar.claimIds.length} claims</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No pillars are published yet.</div>
        )}
      </section>
    </>
  );
}
