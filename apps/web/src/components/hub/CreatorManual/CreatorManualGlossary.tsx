import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getNodesByIds } from '@/lib/hub/creator-manual/content';
import { getCreatorManualLibraryRoute } from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';

export function CreatorManualGlossary({ manifest, index }: { manifest: CreatorManualManifest; index: CreatorManualIndex }) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>Vocabulary</div>
        <h1 className={styles.pageTitle}>Glossary</h1>
        <p className={styles.subtitle}>Creator-specific language with links back to the canon records where it is used.</p>
      </section>
      <section className={styles.section}>
        {manifest.glossary.length > 0 ? (
          <div className={styles.list}>
            {manifest.glossary.map((entry) => {
              const nodes = getNodesByIds(index, entry.relatedNodeIds);
              return (
                <article key={entry.id} id={entry.slug} className={styles.listItem}>
                  <h2 className={styles.cardTitle}>{entry.term}</h2>
                  <p className={styles.prose}>{entry.definition}</p>
                  <div className={styles.tagRow}>
                    {nodes.map((node) => (
                      <Link key={node.id} href={`${getCreatorManualLibraryRoute(manifest.hubSlug)}#${node.slug}`} className={styles.secondaryButton}>
                        {node.title}
                      </Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>No glossary entries are published yet.</div>
        )}
      </section>
    </>
  );
}
