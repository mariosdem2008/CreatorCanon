import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualThemeRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';

export function CreatorManualThemes({ manifest }: { manifest: CreatorManualManifest; index?: CreatorManualIndex }) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>Cross-archive patterns</div>
        <h1 className={styles.pageTitle}>Themes</h1>
        <p className={styles.subtitle}>Recurring ideas that connect pillars, nodes, and evidence across the archive.</p>
      </section>
      <section className={styles.section}>
        {manifest.themes.length > 0 ? (
          <div className={styles.grid}>
            {manifest.themes.map((theme) => (
              <Link key={theme.id} href={getCreatorManualThemeRoute(manifest.hubSlug, theme.slug)} className={styles.recordCard}>
                <span className={styles.tag}>{theme.evidence.length} evidence</span>
                <h2 className={styles.cardTitle}>{theme.title}</h2>
                <p className={styles.cardBody}>{theme.summary}</p>
                <div className={styles.tagRow}>
                  <span className={styles.tag}>{theme.nodeIds.length} nodes</span>
                  <span className={styles.tag}>{theme.pillarIds.length} pillars</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No themes are published yet.</div>
        )}
      </section>
    </>
  );
}
