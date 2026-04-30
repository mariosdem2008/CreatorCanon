/**
 * Audit page view types — model the FULL pipeline output, not summaries.
 *
 * The audit page must render 100% of what the pipeline extracted; components
 * therefore receive full payloads as well as the convenience fields the page
 * needs to show as headers/badges.
 */

export interface RunAuditView {
  runId: string;
  projectId: string;
  projectTitle: string | null;
  status:
    | 'audit_ready'
    | 'running'
    | 'awaiting_review'
    | 'published'
    | 'failed'
    | 'canceled'
    | 'queued'
    | 'awaiting_payment'
    | 'draft';
  channelProfile: ChannelProfileView | null;
  visualMoments: VisualMomentView[];
  videoIntelligenceCards: VideoIntelligenceCardView[];
  canonNodes: CanonNodeView[];
  pageBriefs: PageBriefView[];
  costCents: number;
  costByStage: Array<{ stage: string; costCents: number }>;
  /** videoId -> human title, for resolving canon node sourceVideoIds and brief refs. */
  videoTitleById: Record<string, string>;
  /** segmentId → { videoId, startMs } — used by the markdown export to render clickable YouTube timestamps. */
  segmentMap: Record<string, { videoId: string; startMs: number }>;
  /** videoId → YouTube video ID (the `v=` parameter) — null when no YouTube linkage exists. */
  youtubeIdByVideoId: Record<string, string | null>;
}

export interface ChannelProfileView {
  /** Full payload for any field we don't surface explicitly. */
  payload: Record<string, unknown>;
  creatorName: string | null;
  niche: string | null;
  audience: string | null;
  dominantTone: string | null;
  recurringPromise: string | null;
  whyPeopleFollow: string | null;
  expertiseCategory: string | null;
  monetizationAngle: string | null;
  positioningSummary: string | null;
  contentFormats: string[];
  recurringThemes: string[];
  creatorTerminology: string[];
}

export interface VisualMomentView {
  id: string;
  videoId: string;
  videoTitle: string;
  timestampMs: number;
  type: string;
  description: string;
  hubUse: string | null;
  usefulnessScore: number | null;
  extractedText: string | null;
}

export interface VideoIntelligenceCardView {
  videoId: string;
  videoTitle: string;
  evidenceSegmentCount: number;
  /** Full extracted payload (mainIdeas, frameworks, lessons, examples, stories,
   *  mistakesToAvoid, failureModes, counterCases, quotes, strongClaims,
   *  contrarianTakes, termsDefined, toolsMentioned, creatorVoiceNotes,
   *  recommendedHubUses, etc.). Components decide what to render. */
  payload: Record<string, unknown>;
}

export interface CanonNodeView {
  id: string;
  type: string;
  title: string | null;
  /** Full payload (definition / summary / whenToUse / whenNotToUse /
   *  commonMistake / successSignal / sequencingRationale / preconditions /
   *  steps / failureModes / examples / etc.). Components render every
   *  meaningful field. */
  payload: Record<string, unknown>;
  sourceVideoIds: string[];
  sourceVideoTitles: string[];
  evidenceQuality: string | null;
  origin: string | null;
  confidenceScore: number | null;
  pageWorthinessScore: number | null;
  specificityScore: number | null;
  creatorUniquenessScore: number | null;
  citationCount: number | null;
  sourceCoverage: number | null;
}

export interface PageBriefView {
  id: string;
  position: number;
  pageType: string;
  pageTitle: string;
  slug: string | null;
  audienceQuestion: string | null;
  openingHook: string | null;
  pageWorthinessScore: number | null;
  primaryCanonNodeIds: string[];
  supportingCanonNodeIds: string[];
  /** Full payload for any planning fields (anglesToHit, mustCite, structureNotes…). */
  payload: Record<string, unknown>;
}
