import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getNodesByIds } from '@/lib/hub/creator-manual/content';
import { getCreatorManualLibraryRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest, CreatorManualWorkshopStage } from '@/lib/hub/creator-manual/schema';

import { EvidenceGrid } from './EvidenceGrid';
import styles from './CreatorManual.module.css';

export function CreatorManualWorkshopDetail({
  manifest,
  index,
  stage,
}: {
  manifest: CreatorManualManifest;
  index: CreatorManualIndex;
  stage: CreatorManualWorkshopStage;
}) {
  const nodes = getNodesByIds(index, stage.nodeIds);

  return (
    <>
      <section>
        <div className={styles.eyebrow}>Workshop stage</div>
        <h1 className={styles.pageTitle}>{stage.title}</h1>
        <p className={styles.subtitle}>{stage.objective}</p>
      </section>
      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <ol className={styles.list}>
            {stage.steps.map((step, index) => (
              <li key={step.title} className={styles.listItem}>
                <div className={styles.tag}>Step {(index + 1).toString().padStart(2, '0')}</div>
                <h2 className={styles.cardTitle}>{step.title}</h2>
                <p className={styles.prose}>{step.body}</p>
              </li>
            ))}
          </ol>
          <aside>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Related nodes</h2>
            </div>
            <div className={styles.list}>
              {nodes.map((node) => (
                <Link key={node.id} href={`${getCreatorManualLibraryRoute(manifest.hubSlug)}#${node.slug}`} className={styles.recordCard}>
                  <span className={styles.tag}>{node.type}</span>
                  <h3 className={styles.cardTitle}>{node.title}</h3>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </section>
      <EvidenceGrid manifest={manifest} refs={stage.evidence} />
    </>
  );
}
