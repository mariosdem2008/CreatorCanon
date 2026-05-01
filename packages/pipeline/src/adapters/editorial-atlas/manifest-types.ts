/**
 * Local mirror of the manifest types defined by the Editorial Atlas template
 * in `apps/web/src/lib/hub/manifest/schema.ts`.
 *
 * Duplicating these here avoids a cross-package import (pipeline → apps/web),
 * which is architecturally wrong: the pipeline produces manifests, the renderer
 * consumes them. Both must stay in sync; manifest-shape changes go to
 * `apps/web/.../schema.ts` AND here.
 */

export interface NavItem { label: string; href: string; iconKey: string; }

export interface Topic {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconKey: string;
  accentColor: 'mint'|'peach'|'lilac'|'rose'|'blue'|'amber'|'sage'|'slate';
  pageCount: number;
}

export interface Citation {
  id: string;
  sourceVideoId: string;
  videoTitle: string;
  timestampStart: number;
  timestampEnd: number;
  timestampLabel: string;
  excerpt: string;
  url?: string;
}

export type PageSection = { kind: string; [k: string]: unknown };

export interface Page {
  id: string;
  slug: string;
  type: 'lesson'|'framework'|'playbook';
  status: 'draft'|'reviewed'|'published';
  title: string;
  summary: string;
  summaryPlainText: string;
  readerJob?: WorkbenchIntent;
  outcome?: string;
  useWhen?: string[];
  artifactIds?: string[];
  sourceMomentIds?: string[];
  nextStepPageIds?: string[];
  searchKeywords: string[];
  topicSlugs: string[];
  estimatedReadMinutes: number;
  publishedAt: string | null;
  updatedAt: string;
  citationCount: number;
  sourceCoveragePercent: number;
  evidenceQuality: 'strong'|'moderate'|'limited';
  reviewedBy?: string;
  lastReviewedAt?: string;
  hero?: { illustrationKey: 'books'|'desk'|'plant'|'open-notebook' };
  sections: PageSection[];
  citations: Citation[];
  relatedPageIds: string[];
}

export interface SourceVideo {
  id: string;
  youtubeId: string | null;
  title: string;
  channelName: string;
  publishedAt: string;
  durationSec: number | null;
  thumbnailUrl: string;
  transcriptStatus: 'available'|'partial'|'unavailable';
  topicSlugs: string[];
  citedPageIds: string[];
  keyMoments: { timestampStart: number; timestampEnd: number; label: string }[];
  transcriptExcerpts: { timestampStart: number; body: string }[];
}

export interface Highlight {
  id: string;
  type: 'aha_moment'|'quote';
  text: string;
  context?: string;
  attribution?: string;
  evidence: { sourceVideoId: string; timestampStart: number; timestampLabel: string };
}

export type WorkbenchIntent = 'learn'|'build'|'copy'|'decide'|'debug';

export interface Artifact {
  id: string;
  type: 'prompt'|'checklist'|'workflow'|'template'|'schema'|'mistake_map';
  title: string;
  body: string;
  pageId: string;
  citationIds: string[];
}

export interface SourceMoment {
  id: string;
  title: string;
  sourceVideoId: string;
  timestampStart: number;
  timestampLabel: string;
  excerpt: string;
  pageIds: string[];
}

export interface GuidedPath {
  id: string;
  title: string;
  body: string;
  outcome: string;
  timeLabel: string;
  pageIds: string[];
  artifactIds: string[];
  sourceMomentIds: string[];
}

export interface HubWorkbenchNative {
  primaryAction: { label: string; pageId?: string; href?: string };
  guidedPaths: GuidedPath[];
  artifacts: Artifact[];
  sourceMoments: SourceMoment[];
}

export interface EditorialAtlasManifest {
  schemaVersion: 'editorial_atlas_v1'|'editorial_atlas_v2';
  hubId: string;
  releaseId: string;
  hubSlug: string;
  templateKey: 'editorial_atlas';
  visibility: 'public'|'unlisted';
  publishedAt: string | null;
  generatedAt: string;
  title: string;
  tagline: string;
  creator: { name: string; handle: string; avatarUrl: string; bio: string; youtubeChannelUrl: string };
  stats: { videoCount: number; sourceCount: number; transcriptPercent: number; archiveYears: number; totalDurationMinutes: number; pageCount: number };
  topics: Topic[];
  pages: Page[];
  sources: SourceVideo[];
  navigation: { primary: NavItem[]; secondary: NavItem[] };
  trust: {
    methodologySummary: string;
    qualityPrinciples: { title: string; body: string }[];
    creationProcess: { stepNumber: number; title: string; body: string }[];
    faq: { question: string; answer: string }[];
  };
  highlights?: Highlight[];
  workbench?: HubWorkbenchNative;
}
