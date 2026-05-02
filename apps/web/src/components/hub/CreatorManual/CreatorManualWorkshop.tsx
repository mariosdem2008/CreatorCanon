import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualWorkshopStageRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';

export function CreatorManualWorkshop({ manifest }: { manifest: CreatorManualManifest; index?: CreatorManualIndex }) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>Guided implementation</div>
        <h1 className={styles.pageTitle}>{manifest.brand.labels.workshop ?? 'Workshop'}</h1>
        <p className={styles.subtitle}>A practical path through the manual, ordered as stages to apply the creator operating system.</p>
      </section>
      <section className={styles.section}>
        {manifest.workshop.length > 0 ? (
          <div className={styles.grid}>
            {manifest.workshop.map((stage, index) => (
              <Link key={stage.id} href={getCreatorManualWorkshopStageRoute(manifest.hubSlug, stage.slug)} className={styles.recordCard}>
                <span className={styles.tag}>Stage {(index + 1).toString().padStart(2, '0')}</span>
                <h2 className={styles.cardTitle}>{stage.title}</h2>
                <p className={styles.cardBody}>{stage.summary}</p>
                <div className={styles.tagRow}>
                  <span className={styles.tag}>{stage.steps.length} steps</span>
                  <span className={styles.tag}>{stage.evidence.length} evidence</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No workshop stages are published yet.</div>
        )}
      </section>
    </>
  );
}
