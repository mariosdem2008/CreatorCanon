import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getNodesByIds, getPillarsByIds } from '@/lib/hub/creator-manual/content';
import { getCreatorManualLibraryRoute, getCreatorManualPillarRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest, CreatorManualTheme } from '@/lib/hub/creator-manual/schema';

import { EvidenceGrid } from './EvidenceGrid';
import styles from './CreatorManual.module.css';

export function CreatorManualThemeDetail({
  manifest,
  index,
  theme,
}: {
  manifest: CreatorManualManifest;
  index: CreatorManualIndex;
  theme: CreatorManualTheme;
}) {
  const nodes = getNodesByIds(index, theme.nodeIds);
  const pillars = getPillarsByIds(index, theme.pillarIds);

  return (
    <>
      <section>
        <div className={styles.eyebrow}>Theme</div>
        <h1 className={styles.pageTitle}>{theme.title}</h1>
        <p className={styles.subtitle}>{theme.summary}</p>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Connected records</h2>
        </div>
        <div className={styles.denseGrid}>
          {pillars.map((pillar) => (
            <Link key={pillar.id} href={getCreatorManualPillarRoute(manifest.hubSlug, pillar.slug)} className={styles.recordCard}>
              <span className={styles.tag}>pillar</span>
              <h3 className={styles.cardTitle}>{pillar.title}</h3>
              <p className={styles.cardBody}>{pillar.summary}</p>
            </Link>
          ))}
          {nodes.map((node) => (
            <Link key={node.id} href={`${getCreatorManualLibraryRoute(manifest.hubSlug)}#${node.slug}`} className={styles.recordCard}>
              <span className={styles.tag}>{node.type}</span>
              <h3 className={styles.cardTitle}>{node.title}</h3>
              <p className={styles.cardBody}>{node.summary}</p>
            </Link>
          ))}
        </div>
      </section>
      <EvidenceGrid manifest={manifest} refs={theme.evidence} />
    </>
  );
}
