'use client';

import { useState } from 'react';

import type { CreatorManualSource } from '@/lib/hub/creator-manual/schema';

import styles from './CreatorManual.module.css';

type MiniEvidenceVideoProps = {
  source: CreatorManualSource;
  timestampStart?: number;
};

const youtubePoster = (source: CreatorManualSource) =>
  source.thumbnailUrl ?? (source.youtubeId ? `https://i.ytimg.com/vi/${source.youtubeId}/hqdefault.jpg` : null);

export function MiniEvidenceVideo({ source, timestampStart = 0 }: MiniEvidenceVideoProps) {
  const [loaded, setLoaded] = useState(false);
  const poster = youtubePoster(source);
  const start = Math.max(0, Math.floor(timestampStart));
  const embedUrl = source.youtubeId
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(source.youtubeId)}?start=${start}&autoplay=1`
    : null;

  return (
    <div className={styles.videoShell}>
      {loaded && embedUrl ? (
        <iframe
          src={embedUrl}
          title={source.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <>
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" loading="lazy" />
          ) : null}
          {embedUrl ? (
            <button type="button" className={styles.videoButton} onClick={() => setLoaded(true)}>
              <span className={styles.playBadge}>Play source</span>
            </button>
          ) : (
            <div className={styles.videoButton} aria-hidden="true">
              <span className={styles.playBadge}>Source file</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
