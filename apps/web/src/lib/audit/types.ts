export interface RunAuditView {
  runId: string;
  projectId: string;
  status: 'audit_ready' | 'running' | 'awaiting_review' | 'published' | 'failed' | 'canceled' | 'queued' | 'awaiting_payment' | 'draft';
  channelProfile: ChannelProfileView | null;
  visualMoments: VisualMomentView[];
  videoIntelligenceCards: VideoIntelligenceCardView[];
  canonNodes: CanonNodeView[];
  pageBriefs: PageBriefView[];
  costCents: number;
}

export interface ChannelProfileView {
  creatorName: string | null;
  niche: string | null;
  audience: string | null;
  dominantTone: string | null;
  recurringPromise: string | null;
  positioningSummary: string | null;
  creatorTerminology: string[];
}

export interface VisualMomentView {
  id: string;
  videoId: string;
  videoTitle: string;
  timestampMs: number;
  type: string;
  description: string;
}

export interface VideoIntelligenceCardView {
  videoId: string;
  videoTitle: string;
  mainIdeaCount: number;
  frameworkCount: number;
  lessonCount: number;
  exampleCount: number;
  mistakeCount: number;
  quoteCount: number;
}

export interface CanonNodeView {
  id: string;
  type: string;
  title: string | null;
  whenToUse: string | null;
  pageWorthinessScore: number | null;
}

export interface PageBriefView {
  id: string;
  pageType: string;
  pageTitle: string;
  audienceQuestion: string | null;
  primaryCanonNodeIds: string[];
  position: number;
}
