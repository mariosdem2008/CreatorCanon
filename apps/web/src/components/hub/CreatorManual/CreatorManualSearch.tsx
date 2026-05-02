import Link from 'next/link';

import type { CreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { searchCreatorManual } from '@/lib/hub/creator-manual/search';
import type { CreatorManualManifest, CreatorManualSearchDocType } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';

type CreatorManualSearchProps = {
  manifest: CreatorManualManifest;
  index?: CreatorManualIndex;
  query?: string;
  types?: CreatorManualSearchDocType[];
};

export function CreatorManualSearch({ manifest, query = '', types }: CreatorManualSearchProps) {
  const results = searchCreatorManual(manifest, query, { types, limit: 40 });

  return (
    <>
      <section>
        <div className={styles.eyebrow}>Archive search</div>
        <h1 className={styles.pageTitle}>Search</h1>
        <p className={styles.subtitle}>Search nodes, pillars, sources, claims, glossary terms, themes, workshop stages, and segments.</p>
        <form action={`/h/${manifest.hubSlug}/search`} className={styles.searchForm}>
          <input
            className={styles.searchInput}
            type="search"
            name="q"
            defaultValue={query}
            placeholder={`Search ${manifest.creator.name}`}
            aria-label="Search creator manual"
          />
          <button type="submit" className={styles.button}>Search</button>
        </form>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{query ? 'Results' : 'Search index'}</h2>
          <span className={styles.tag}>{query ? results.length : manifest.search.length}</span>
        </div>
        {!query ? (
          <div className={styles.denseGrid}>
            {manifest.search.slice(0, 24).map((doc) => (
              <article key={doc.id} className={styles.recordCard}>
                <span className={styles.tag}>{doc.type}</span>
                <h3 className={styles.cardTitle}>{doc.title}</h3>
                <p className={styles.cardBody}>{doc.summary}</p>
              </article>
            ))}
          </div>
        ) : results.length > 0 ? (
          <div className={styles.list}>
            {results.map((result) => (
              <Link key={result.doc.id} href={result.route} className={styles.recordCard}>
                <div className={styles.tagRow}>
                  <span className={styles.tag}>{result.doc.type}</span>
                  <span className={styles.tag}>score {result.score}</span>
                </div>
                <h3 className={styles.cardTitle}>{result.doc.title}</h3>
                <p className={styles.cardBody}>{result.doc.summary}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No matching manual records found.</div>
        )}
      </section>
    </>
  );
}
