/**
 * Body-with-chips renderer.
 *
 * This file is intentionally not marked 'use client'. Server components call it
 * and Next.js hydrates the client EvidenceChip boundaries inside the returned
 * tree.
 */

import type React from 'react';
import type { VisualMomentView } from '@/lib/audit/types';

import { EvidenceChip, type EvidenceEntry } from './EvidenceChip';
import {
  buildVisualMomentYoutubeUrl,
  formatVisualMomentTimestamp,
  parseBodyReferences,
} from './body-references';

export function renderBodyWithChips({
  body,
  registry,
  segmentById,
  youtubeIdByVideoId,
  visualMomentById,
  debug,
}: {
  body: string;
  registry: Record<string, EvidenceEntry> | undefined;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
  visualMomentById?: Map<string, VisualMomentView>;
  debug: boolean;
}): React.ReactNode[] {
  if (!body) return [];
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const ref of parseBodyReferences(body)) {
    if (ref.index > lastIndex) {
      out.push(<span key={`t${key++}`}>{body.slice(lastIndex, ref.index)}</span>);
    }

    if (ref.kind === 'segment') {
      const entry = registry?.[ref.id];
      const segment = segmentById.get(ref.id);

      if (entry && segment) {
        const youtubeId = youtubeIdByVideoId[segment.videoId] ?? null;
        out.push(
          <EvidenceChip
            key={`c${key++}`}
            segmentId={ref.id}
            entry={entry}
            segment={segment}
            youtubeId={youtubeId}
            debug={debug}
          />,
        );
      } else if (debug) {
        out.push(
          <span key={`u${key++}`} className="text-[9px] font-mono text-rose-600">
            [{ref.id.slice(0, 8)}...]
          </span>,
        );
      }
    } else {
      const moment = visualMomentById?.get(ref.id);
      if (moment) {
        out.push(
          <VisualMomentInline
            key={`vm${key++}`}
            moment={moment}
            youtubeId={youtubeIdByVideoId[moment.videoId] ?? null}
          />,
        );
      } else if (debug) {
        out.push(
          <span key={`vmu${key++}`} className="text-[9px] font-mono text-amber-700">
            [{ref.id}]
          </span>,
        );
      }
    }

    lastIndex = ref.index + ref.token.length;
  }

  if (lastIndex < body.length) {
    out.push(<span key={`t${key++}`}>{body.slice(lastIndex)}</span>);
  }

  return out;
}

function VisualMomentInline({
  moment,
  youtubeId,
}: {
  moment: VisualMomentView;
  youtubeId: string | null;
}) {
  const imageUrl = moment.thumbnailUrl ?? moment.frameUrl;
  const timestamp = formatVisualMomentTimestamp(moment.timestampMs);
  const youtubeUrl = buildVisualMomentYoutubeUrl(youtubeId, moment.timestampMs);
  const content = (
    <span className="my-3 block max-w-[240px] overflow-hidden rounded-[8px] border border-[var(--cc-rule)] bg-white align-middle shadow-sm">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={moment.description}
          className="block aspect-video w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className="flex aspect-video w-full items-center justify-center bg-[var(--cc-surface-2)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
          Visual moment
        </span>
      )}
      <span className="block px-2.5 py-2">
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
          <span>{moment.type.replace(/_/g, ' ')}</span>
          <span className="font-mono tabular-nums">{timestamp}</span>
        </span>
        <span className="mt-1 line-clamp-2 block text-[11px] leading-[1.4] text-[var(--cc-ink-2)]">
          {moment.description}
        </span>
      </span>
    </span>
  );

  if (!youtubeUrl) return content;
  return (
    <a
      href={youtubeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block no-underline hover:opacity-90"
    >
      {content}
    </a>
  );
}
