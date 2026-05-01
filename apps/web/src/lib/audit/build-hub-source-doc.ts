/**
 * Build the Hub Source Document — the v2 audit serialized as a single JSON
 * object. This is what the Copy Audit button hands off to the builder
 * (when this becomes a SaaS, the builder consumes this directly).
 *
 * Spec: docs/superpowers/specs/2026-05-01-hub-source-document-schema.md
 */

import type { RunAuditView } from './types';

interface HubSourceDocument {
  metadata: {
    runId: string;
    projectId: string;
    creatorName: string | null;
    generatedAt: string;
    schemaVersion: 'v2' | 'v1-legacy';
    /** Quality flags surfaced on the audit page (not the builder's job to validate). */
    quality: {
      canonNodeCount: number;
      canonWithBodies: number;
      avgBodyWordCount: number;
      thirdPersonLeak: boolean;
    };
  };
  channelProfile: Record<string, unknown> | null;
  canonNodes: Array<Record<string, unknown> & { id: string; type: string }>;
  pageBriefs: Array<Record<string, unknown>>;
  videos: Array<{
    videoId: string;
    title: string | null;
    durationSec: number | null;
    youtubeId: string | null;
    vic: Record<string, unknown> | null;
  }>;
  visualMoments: Array<Record<string, unknown>>;
  segments: Array<{
    id: string;
    videoId: string;
    startMs: number;
    endMs: number;
    text: string;
  }>;
}

const THIRD_PERSON_PATTERNS = [
  /\bthe creator\b/i,
  /\bthe speaker\b/i,
  /\bthe host\b/i,
  /\bthe author\b/i,
  /\bthe narrator\b/i,
  /\b(she|he|they) (says|argues|explains|notes|claims|believes)\b/i,
];

function detectThirdPersonLeak(canonNodes: RunAuditView['canonNodes']): boolean {
  for (const n of canonNodes) {
    const p = n.payload as { body?: string; lede?: string; title?: string };
    const text = `${p.title ?? ''} ${p.lede ?? ''} ${p.body ?? ''}`;
    for (const re of THIRD_PERSON_PATTERNS) {
      if (re.test(text)) return true;
    }
  }
  return false;
}

export function buildHubSourceDocument(view: RunAuditView): HubSourceDocument {
  const cpPayload = view.channelProfile?.payload ?? null;
  const isV2 = (cpPayload as { schemaVersion?: string } | null)?.schemaVersion === 'v2';

  const canonNodes = view.canonNodes.map((n) => ({
    id: n.id,
    type: n.type,
    confidenceScore: n.confidenceScore,
    pageWorthinessScore: n.pageWorthinessScore,
    specificityScore: n.specificityScore,
    creatorUniquenessScore: n.creatorUniquenessScore,
    citationCount: n.citationCount,
    sourceCoverage: n.sourceCoverage,
    sourceVideoIds: n.sourceVideoIds,
    sourceVideoTitles: n.sourceVideoTitles,
    evidenceQuality: n.evidenceQuality,
    origin: n.origin,
    ...(n.payload as Record<string, unknown>),
  }));

  const pageBriefs = view.pageBriefs.map((b) => ({
    ...(b.payload as Record<string, unknown>),
  }));

  const videos = view.videoIntelligenceCards.map((vic) => ({
    videoId: vic.videoId,
    title: vic.videoTitle ?? null,
    durationSec: null,
    youtubeId: view.youtubeIdByVideoId[vic.videoId] ?? null,
    vic: vic.payload as Record<string, unknown>,
  }));

  // Compute quality flags.
  const canonWithBodies = canonNodes.filter((n) => {
    const body = (n as { body?: string }).body;
    return typeof body === 'string' && body.length > 100;
  }).length;
  const wordCounts = canonNodes
    .map((n) => {
      const body = (n as { body?: string }).body ?? '';
      return body.split(/\s+/).filter(Boolean).length;
    })
    .filter((w) => w > 0);
  const avgBodyWordCount = wordCounts.length > 0
    ? Math.round(wordCounts.reduce((s, w) => s + w, 0) / wordCounts.length)
    : 0;
  const thirdPersonLeak = detectThirdPersonLeak(view.canonNodes);

  // Visual moments + segments are passthrough.
  const visualMoments = view.visualMoments.map((m) => ({
    id: m.id,
    videoId: m.videoId,
    timestampMs: m.timestampMs,
    type: m.type,
    description: m.description,
    extractedText: m.extractedText,
    hubUse: m.hubUse,
    usefulnessScore: m.usefulnessScore,
  }));

  // Segments come from segmentMap (videoId + startMs only — full text via separate join in v2 builder).
  const segments = Object.entries(view.segmentMap).map(([id, info]) => ({
    id,
    videoId: info.videoId,
    startMs: info.startMs,
    endMs: 0,  // We'd need to extend RunAuditView to include endMs + text; for now placeholder
    text: '',
  }));

  return {
    metadata: {
      runId: view.runId,
      projectId: view.projectId,
      creatorName: (cpPayload as { creatorName?: string } | null)?.creatorName ?? null,
      generatedAt: new Date().toISOString(),
      schemaVersion: isV2 ? 'v2' : 'v1-legacy',
      quality: {
        canonNodeCount: canonNodes.length,
        canonWithBodies,
        avgBodyWordCount,
        thirdPersonLeak,
      },
    },
    channelProfile: cpPayload as Record<string, unknown> | null,
    canonNodes,
    pageBriefs,
    videos,
    visualMoments,
    segments,
  };
}
