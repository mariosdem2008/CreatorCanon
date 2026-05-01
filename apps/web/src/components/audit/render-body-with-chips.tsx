/**
 * Body-with-chips renderer.
 *
 * NOTE: this file is intentionally NOT marked `'use client'`. It can be called
 * from server components (HubSourceV2View) and returns React nodes that
 * include `<EvidenceChip />` — a client component. Next.js handles that
 * boundary automatically: the server-rendered tree references the client
 * chip, which hydrates with its own bundle.
 *
 * If you put `'use client'` here, server components calling this function get
 * a runtime "renderBodyWithChips is not a function" error because the module
 * is not loaded server-side.
 */

import type React from 'react';

import { EvidenceChip, type EvidenceEntry } from './EvidenceChip';

const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

export function renderBodyWithChips({
  body,
  registry,
  segmentById,
  youtubeIdByVideoId,
  debug,
}: {
  body: string;
  registry: Record<string, EvidenceEntry> | undefined;
  segmentById: Map<string, { videoId: string; startMs: number; text?: string }>;
  youtubeIdByVideoId: Record<string, string | null>;
  debug: boolean;
}): React.ReactNode[] {
  if (!body) return [];
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // Reset regex state (top-level const has its own state across calls).
  const re = new RegExp(UUID_REGEX.source, UUID_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    // Push text before this match.
    if (match.index > lastIndex) {
      out.push(<span key={`t${key++}`}>{body.slice(lastIndex, match.index)}</span>);
    }

    const segmentId = match[1]!;
    const entry = registry?.[segmentId];
    const segment = segmentById.get(segmentId);

    if (entry && segment) {
      const youtubeId = youtubeIdByVideoId[segment.videoId] ?? null;
      out.push(
        <EvidenceChip
          key={`c${key++}`}
          segmentId={segmentId}
          entry={entry}
          segment={segment}
          youtubeId={youtubeId}
          debug={debug}
        />,
      );
    } else if (debug) {
      // Citation but no registry entry — show raw token in debug mode, hide otherwise.
      out.push(
        <span key={`u${key++}`} className="text-[9px] font-mono text-rose-600">
          [{segmentId.slice(0, 8)}...]
        </span>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text after last match.
  if (lastIndex < body.length) {
    out.push(<span key={`t${key++}`}>{body.slice(lastIndex)}</span>);
  }

  return out;
}
