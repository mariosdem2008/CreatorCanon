import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getClaimsByIds, getPillarsByIds, getThemesByIds } from '@/lib/hub/creator-manual/content';
import {
  getCreatorManualClaimRoute,
  getCreatorManualPillarRoute,
  getCreatorManualThemeRoute,
} from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';
import { creatorManualCardStyle, creatorManualTypeColor } from './visualStyle';

type CreatorManualLibraryProps = {
  manifest: CreatorManualManifest;
  index: CreatorManualIndex;
};

export function CreatorManualLibrary({ manifest, index }: CreatorManualLibraryProps) {
  return (
    <>
      <section>
        <div className={styles.eyebrow}>{manifest.creator.name} canon</div>
        <h1 className={styles.pageTitle}>{manifest.brand.labels.library ?? 'Library'}</h1>
        <p className={styles.subtitle}>
          Reusable ideas, rules, warnings, playbooks, metrics, and examples from the archive.
        </p>
      </section>
      <section className={styles.section}>
        {manifest.nodes.length > 0 ? (
          <div className={styles.grid}>
            {manifest.nodes.map((node, cardIndex) => {
              const pillars = getPillarsByIds(index, node.pillarIds);
              const themes = getThemesByIds(index, node.themeIds);
              const claims = getClaimsByIds(index, node.claimIds);
              const typeColor = creatorManualTypeColor(manifest, node.type);
              return (
                <article
                  key={node.id}
                  id={node.slug}
                  className={styles.recordCard}
                  data-record-type={node.type}
                  style={creatorManualCardStyle({ index: cardIndex, typeColor })}
                >
                  <div className={styles.tagRow}>
                    <span className={styles.typeTag}>{node.type}</span>
                    <span className={styles.scoreTag}>{node.evidence.length} evidence</span>
                  </div>
                  <h2 className={styles.cardTitle}>{node.title}</h2>
                  <p className={styles.cardBody}>{node.summary}</p>
                  <p className={styles.cardBody}>{node.body}</p>
                  <div className={styles.tagRow}>
                    {pillars.map((pillar) => (
                      <Link
                        key={pillar.id}
                        href={getCreatorManualPillarRoute(manifest.hubSlug, pillar.slug)}
                        className={styles.secondaryButton}
                      >
                        {pillar.title}
                      </Link>
                    ))}
                    {themes.map((theme) => (
                      <Link
                        key={theme.id}
                        href={getCreatorManualThemeRoute(manifest.hubSlug, theme.slug)}
                        className={styles.secondaryButton}
                      >
                        {theme.title}
                      </Link>
                    ))}
                    {claims.map((claim) => (
                      <Link
                        key={claim.id}
                        href={getCreatorManualClaimRoute(manifest.hubSlug, claim.id)}
                        className={styles.secondaryButton}
                      >
                        {claim.title}
                      </Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>No library records are published yet.</div>
        )}
      </section>
    </>
  );
}
