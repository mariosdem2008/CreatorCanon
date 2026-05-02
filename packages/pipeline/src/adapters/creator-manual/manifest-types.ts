export interface CreatorManualEvidenceRef {
  sourceId: string;
  segmentId?: string;
  timestampStart?: number;
  timestampEnd?: number;
  note?: string;
}

export interface CreatorManualNavItem {
  label: string;
  routeKey:
    | 'home'
    | 'library'
    | 'pillars'
    | 'sources'
    | 'segments'
    | 'claims'
    | 'glossary'
    | 'themes'
    | 'workshop'
    | 'search';
}

export interface CreatorManualNode {
  id: string;
  slug: string;
  type: string;
  title: string;
  summary: string;
  body: string;
  pillarIds: string[];
  themeIds: string[];
  claimIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualPillar {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  sections?: { title: string; body: string }[];
  nodeIds: string[];
  claimIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualSource {
  id: string;
  title: string;
  creatorName: string;
  platform: 'youtube' | 'podcast' | 'article' | 'workshop' | 'other';
  youtubeId: string | null;
  url?: string;
  thumbnailUrl?: string;
  publishedAt: string | null;
  durationSec: number | null;
  summary: string;
  segmentIds: string[];
}

export interface CreatorManualSegment {
  id: string;
  sourceId: string;
  slug: string;
  title: string;
  summary: string;
  timestampStart: number;
  timestampEnd: number;
  transcriptExcerpt: string;
  nodeIds: string[];
  claimIds: string[];
}

export interface CreatorManualClaim {
  id: string;
  title: string;
  statement: string;
  confidence: 'strong' | 'moderate' | 'developing';
  evidence: CreatorManualEvidenceRef[];
  relatedNodeIds: string[];
}

export interface CreatorManualGlossaryEntry {
  id: string;
  term: string;
  slug: string;
  definition: string;
  relatedNodeIds: string[];
}

export interface CreatorManualTheme {
  id: string;
  slug: string;
  title: string;
  summary: string;
  nodeIds: string[];
  pillarIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualWorkshopStage {
  id: string;
  slug: string;
  title: string;
  summary: string;
  objective: string;
  steps: { title: string; body: string }[];
  nodeIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualSearchDoc {
  id: string;
  type: 'node' | 'pillar' | 'source' | 'segment' | 'claim' | 'glossary' | 'theme' | 'workshop';
  recordId: string;
  slug?: string;
  title: string;
  summary: string;
  body?: string;
  keywords?: string[];
}

export interface CreatorManualManifest {
  schemaVersion: 'creator_manual_v1';
  template: { id: 'creator-manual'; version: number };
  hubId: string;
  releaseId: string;
  hubSlug: string;
  visibility: 'public' | 'unlisted';
  publishedAt: string | null;
  generatedAt: string;
  title: string;
  tagline: string;
  creator: {
    name: string;
    handle: string;
    avatarUrl?: string;
    portraitUrl?: string;
    canonicalUrl: string;
    tagline: string;
    thesis: string;
    about: string;
    voiceSummary: string;
  };
  brand: {
    name: string;
    tone: string;
    tokens: {
      colors: {
        background: string;
        foreground: string;
        surface: string;
        elevated: string;
        border: string;
        muted: string;
        accent: string;
        accentForeground: string;
        warning: string;
        success: string;
        typeMap?: Record<string, string>;
      };
      typography: { headingFamily: string; bodyFamily: string };
      radius: string;
      shadow: string;
    };
    assets?: { logoUrl?: string; heroImageUrl?: string; patternImageUrl?: string };
    style: { mode: 'light' | 'dark' | 'system' | 'custom' };
    labels: { evidence?: string; workshop?: string; library?: string };
  };
  navigation: { primary: CreatorManualNavItem[]; secondary: CreatorManualNavItem[] };
  home: {
    eyebrow: string;
    headline: string;
    summary: string;
    featuredNodeIds: string[];
    featuredPillarIds: string[];
  };
  stats: {
    nodeCount: number;
    pillarCount: number;
    sourceCount: number;
    segmentCount: number;
    claimCount: number;
    glossaryCount: number;
  };
  nodes: CreatorManualNode[];
  pillars: CreatorManualPillar[];
  sources: CreatorManualSource[];
  segments: CreatorManualSegment[];
  claims: CreatorManualClaim[];
  glossary: CreatorManualGlossaryEntry[];
  themes: CreatorManualTheme[];
  workshop: CreatorManualWorkshopStage[];
  search: CreatorManualSearchDoc[];
}
