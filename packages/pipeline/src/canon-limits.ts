/**
 * Run-level limits for the canon_v1 deep-knowledge-extraction engine.
 * Stage 1 v4 plan § "Run limits".
 */
export const CANON_LIMITS = {
  /** Below this, the channel-profiler can't form a meaningful creator picture. */
  minSelectedVideos: 2,
  /** Above this, run cost + wall time are unacceptable for a v1 hub. */
  maxSelectedVideos: 20,
  /** Sweet spot for a focused hub (recommended UX guidance, not enforced). */
  recommendedSelectedVideosLow: 8,
  recommendedSelectedVideosHigh: 15,
  /** Hard cap on transcript bytes a single VIC analyst will ingest. */
  maxTranscriptCharsPerVideo: 120_000,
} as const;

/**
 * Visual-context limits (Stage 1 v4 plan § "Run limits" + § Phase 6.2).
 * These are enforceable defaults — env vars in the visual-context stage
 * may tighten them per run. They never loosen past these bounds.
 */
export const VISUAL_LIMITS = {
  /** Frames sampled per video before any usefulness scoring. */
  maxFramesPerVideo: 12,
  /** After scoring + dedupe, at most this many moments are persisted per video. */
  maxVisualMomentsPerVideo: 6,
  /** Below this score, frames are dropped and never persisted. */
  minUsefulnessScore: 60,
} as const;

export type CanonLimits = typeof CANON_LIMITS;
export type VisualLimits = typeof VISUAL_LIMITS;
