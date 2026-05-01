import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getNodesByIds, getPillarsByIds } from '@/lib/hub/creator-manual/content';
import {
  getCreatorManualLibraryRoute,
  getCreatorManualPillarRoute,
  getCreatorManualSourcesRoute,
} from '@/lib/hub/creator-manual/routes';
import type { CreatorManualManifest } from '@/lib/hub/creator-manual/schema';

import { EvidenceGrid } from './EvidenceGrid';
import styles from './CreatorManual.module.css';

type CreatorManualHomeProps = {
  manifest: CreatorManualManifest;
  index: CreatorManualIndex;
};

export function CreatorManualHome({ manifest, index }: CreatorManualHomeProps) {
  const featuredNodes = getNodesByIds(index, manifest.home.featuredNodeIds);
  const featuredPillars = getPillarsByIds(index, manifest.home.featuredPillarIds);
  const firstEvidence = [...featuredNodes.flatMap((node) => node.evidence), ...featuredPillars.flatMap((pillar) => pillar.evidence)].slice(0, 4);

  return (
    <>
      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>{manifest.home.eyebrow}</div>
          <h1 className={styles.title}>{manifest.home.headline}</h1>
          <p className={styles.subtitle}>{manifest.home.summary}</p>
          <div className={styles.tagRow}>
            <Link href={getCreatorManualLibraryRoute(manifest.hubSlug)} className={styles.button}>
              Open library
            </Link>
            <Link href={getCreatorManualSourcesRoute(manifest.hubSlug)} className={styles.secondaryButton}>
              Inspect sources
            </Link>
          </div>
          <dl className={styles.stats}>
            {[
              ['Nodes', manifest.stats.nodeCount],
              ['Sources', manifest.stats.sourceCount],
              ['Segments', manifest.stats.segmentCount],
              ['Claims', manifest.stats.claimCount],
              ['Pillars', manifest.stats.pillarCount],
              ['Glossary', manifest.stats.glossaryCount],
            ].map(([label, value]) => (
              <div key={label} className={styles.stat}>
                <dt className={styles.statLabel}>{label}</dt>
                <dd className={styles.statValue}>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div
          className={styles.heroMedia}
          style={manifest.brand.assets?.heroImageUrl ? { backgroundImage: `url("${manifest.brand.assets.heroImageUrl}")` } : undefined}
          aria-hidden="true"
        />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{manifest.brand.labels.library ?? 'Canon library'}</h2>
          <span className={styles.tag}>{featuredNodes.length} featured</span>
        </div>
        {featuredNodes.length > 0 ? (
          <div className={styles.grid}>
            {featuredNodes.map((node) => (
              <Link key={node.id} href={`${getCreatorManualLibraryRoute(manifest.hubSlug)}#${node.slug}`} className={styles.recordCard}>
                <span className={styles.tag}>{node.type}</span>
                <h3 className={styles.cardTitle}>{node.title}</h3>
                <p className={styles.cardBody}>{node.summary}</p>
                <div className={styles.tagRow}>
                  <span className={styles.tag}>{node.evidence.length} evidence</span>
                  <span className={styles.tag}>{node.claimIds.length} claims</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No featured library records are published yet.</div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Operating pillars</h2>
          <span className={styles.tag}>{featuredPillars.length} featured</span>
        </div>
        {featuredPillars.length > 0 ? (
          <div className={styles.grid}>
            {featuredPillars.map((pillar) => (
              <Link key={pillar.id} href={getCreatorManualPillarRoute(manifest.hubSlug, pillar.slug)} className={styles.recordCard}>
                <h3 className={styles.cardTitle}>{pillar.title}</h3>
                <p className={styles.cardBody}>{pillar.summary}</p>
                <div className={styles.tagRow}>
                  <span className={styles.tag}>{pillar.nodeIds.length} nodes</span>
                  <span className={styles.tag}>{pillar.evidence.length} evidence</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No featured pillars are published yet.</div>
        )}
      </section>

      <EvidenceGrid manifest={manifest} refs={firstEvidence} title="First evidence to inspect" />
    </>
  );
}
