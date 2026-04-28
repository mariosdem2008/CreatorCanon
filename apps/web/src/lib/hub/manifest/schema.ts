// apps/web/src/lib/hub/manifest/schema.ts
//
// Zod runtime + TypeScript types for the Editorial Atlas public hub manifest.
// This is the contract every route handler MUST validate against before render.

import { z } from 'zod';

// Discriminated-union for page sections. Every variant accepts an optional
// citationIds[] referencing the page's de-duplicated citations array.
const sectionCitations = { citationIds: z.array(z.string().min(1)).optional() };

export const pageSectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('overview'),        body: z.string().min(1),                                                  ...sectionCitations }),
  z.object({ kind: z.literal('why_it_works'),    body: z.string().min(1), points: z.array(z.string().min(1)).optional(),    ...sectionCitations }),
  z.object({ kind: z.literal('steps'),           title: z.string().min(1),
             items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1),                        ...sectionCitations }),
  z.object({ kind: z.literal('common_mistakes'), items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('aha_moments'),     items: z.array(z.object({ quote: z.string().min(1), attribution: z.string().optional() })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('principles'),      items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1), iconKey: z.string().optional() })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('scenes'),          items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('workflow'),
             schedule: z.array(z.object({ day: z.string().min(1), items: z.array(z.string().min(1)).min(1) })).min(1),       ...sectionCitations }),
  z.object({ kind: z.literal('failure_points'),  items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('callout'),
             tone: z.enum(['note', 'warn', 'success']), body: z.string().min(1),                                              ...sectionCitations }),
  z.object({ kind: z.literal('paragraph'),       body: z.string().min(1),                                                    ...sectionCitations }),
  z.object({ kind: z.literal('list'),            ordered: z.boolean(), items: z.array(z.string().min(1)).min(1),             ...sectionCitations }),
  z.object({ kind: z.literal('quote'),           body: z.string().min(1),
             attribution: z.string().optional(),
             sourceVideoId: z.string().optional(),
             timestampStart: z.number().int().min(0).optional(),                                                              ...sectionCitations }),
  z.object({
    kind: z.literal('roadmap'),
    title: z.string().min(1),
    steps: z.array(z.object({
      index: z.number().int().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      durationLabel: z.string().optional(),
    })).min(2).max(9),
    ...sectionCitations,
  }),
  z.object({
    kind: z.literal('diagram'),
    diagramType: z.enum(['flowchart', 'sequence', 'state', 'mindmap']),
    mermaidSrc: z.string().min(10),
    caption: z.string().min(1),
    ...sectionCitations,
  }),
  z.object({
    kind: z.literal('hypothetical_example'),
    setup: z.string().min(20),
    stepsTaken: z.array(z.string().min(1)).min(2).max(7),
    outcome: z.string().min(10),
    ...sectionCitations,
  }),
]);

export type PageSection = z.infer<typeof pageSectionSchema>;

export const citationSchema = z.object({
  id: z.string().min(1),
  sourceVideoId: z.string().min(1),
  videoTitle: z.string().min(1),
  timestampStart: z.number().int().min(0),
  timestampEnd: z.number().int().min(0),
  timestampLabel: z.string().min(1),
  excerpt: z.string().min(1),
  url: z.string().url().optional(),
});
export type Citation = z.infer<typeof citationSchema>;

export const topicSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  iconKey: z.string().min(1),
  accentColor: z.enum(['mint', 'peach', 'lilac', 'rose', 'blue', 'amber', 'sage', 'slate']),
  pageCount: z.number().int().min(0),
});
export type Topic = z.infer<typeof topicSchema>;

export const workbenchIntentSchema = z.enum(['learn', 'build', 'copy', 'decide', 'debug']);
export type WorkbenchIntent = z.infer<typeof workbenchIntentSchema>;

export const artifactSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['prompt', 'checklist', 'workflow', 'template', 'schema', 'mistake_map']),
  title: z.string().min(1),
  body: z.string().min(1),
  pageId: z.string().min(1),
  citationIds: z.array(z.string().min(1)),
});
export type Artifact = z.infer<typeof artifactSchema>;

export const sourceMomentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sourceVideoId: z.string().min(1),
  timestampStart: z.number().int().min(0),
  timestampLabel: z.string().min(1),
  excerpt: z.string().min(1),
  pageIds: z.array(z.string().min(1)),
});
export type SourceMoment = z.infer<typeof sourceMomentSchema>;

export const guidedPathSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  outcome: z.string().min(1),
  timeLabel: z.string().min(1),
  pageIds: z.array(z.string().min(1)).min(1),
  artifactIds: z.array(z.string().min(1)),
  sourceMomentIds: z.array(z.string().min(1)),
});
export type GuidedPath = z.infer<typeof guidedPathSchema>;

export const hubWorkbenchSchema = z.object({
  primaryAction: z.object({
    label: z.string().min(1),
    pageId: z.string().min(1).optional(),
    href: z.string().min(1).optional(),
  }),
  guidedPaths: z.array(guidedPathSchema).min(1),
  artifacts: z.array(artifactSchema),
  sourceMoments: z.array(sourceMomentSchema),
});
export type HubWorkbenchNative = z.infer<typeof hubWorkbenchSchema>;

export const pageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  type: z.enum(['lesson', 'framework', 'playbook']),
  status: z.enum(['draft', 'reviewed', 'published']),

  title: z.string().min(1),
  summary: z.string().min(1),
  summaryPlainText: z.string().min(1),
  readerJob: workbenchIntentSchema.optional(),
  outcome: z.string().min(1).optional(),
  useWhen: z.string().min(1).optional(),
  artifactIds: z.array(z.string().min(1)).optional(),
  sourceMomentIds: z.array(z.string().min(1)).optional(),
  nextStepPageIds: z.array(z.string().min(1)).optional(),
  searchKeywords: z.array(z.string().min(1)),

  topicSlugs: z.array(z.string().min(1)),
  estimatedReadMinutes: z.number().int().min(1),
  // Nullable so a `status: 'draft'` page can exist without fabricating a date.
  // The renderer filters to status === 'published' before relying on this.
  publishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),

  citationCount: z.number().int().min(0),
  sourceCoveragePercent: z.number().min(0).max(1),
  evidenceQuality: z.enum(['strong', 'moderate', 'limited']),

  reviewedBy: z.string().optional(),
  lastReviewedAt: z.string().datetime().optional(),

  hero: z.object({
    illustrationKey: z.enum(['books', 'desk', 'plant', 'open-notebook']),
  }).optional(),

  sections: z.array(pageSectionSchema).min(1),
  citations: z.array(citationSchema),
  relatedPageIds: z.array(z.string().min(1)),
});
export type Page = z.infer<typeof pageSchema>;

export const sourceVideoSchema = z.object({
  id: z.string().min(1),
  youtubeId: z.string().min(1).nullable(),
  title: z.string().min(1),
  channelName: z.string().min(1),
  publishedAt: z.string().datetime(),
  durationSec: z.number().int().min(0).nullable(),
  thumbnailUrl: z.string().url(),
  transcriptStatus: z.enum(['available', 'partial', 'unavailable']),
  topicSlugs: z.array(z.string().min(1)),
  citedPageIds: z.array(z.string().min(1)),
  keyMoments: z.array(z.object({
    timestampStart: z.number().int().min(0),
    timestampEnd: z.number().int().min(0),
    label: z.string().min(1),
  })),
  transcriptExcerpts: z.array(z.object({
    timestampStart: z.number().int().min(0),
    body: z.string().min(1),
  })),
});
export type SourceVideo = z.infer<typeof sourceVideoSchema>;

export const navItemSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  iconKey: z.string().min(1),
});
export type NavItem = z.infer<typeof navItemSchema>;

export const highlightSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['aha_moment', 'quote']),
  text: z.string().min(1).max(280),
  context: z.string().optional(),
  attribution: z.string().optional(),
  evidence: z.object({
    sourceVideoId: z.string().min(1),
    timestampStart: z.number().int().min(0),
    timestampLabel: z.string().min(1),
  }),
});
export type Highlight = z.infer<typeof highlightSchema>;

export const editorialAtlasManifestSchema = z.object({
  schemaVersion: z.enum(['editorial_atlas_v1', 'editorial_atlas_v2']),
  hubId: z.string().min(1),
  releaseId: z.string().min(1),
  hubSlug: z.string().min(1),
  templateKey: z.literal('editorial_atlas'),
  visibility: z.enum(['public', 'unlisted']),
  publishedAt: z.string().datetime().nullable(),
  generatedAt: z.string().datetime(),

  title: z.string().min(1),
  tagline: z.string().min(1),

  creator: z.object({
    name: z.string().min(1),
    handle: z.string().min(1),
    avatarUrl: z.string(),                       // may be empty string in mock
    bio: z.string(),
    youtubeChannelUrl: z.string(),
  }),

  stats: z.object({
    videoCount: z.number().int().min(0),
    sourceCount: z.number().int().min(0),
    transcriptPercent: z.number().min(0).max(1),
    archiveYears: z.number().min(0),
    totalDurationMinutes: z.number().int().min(0),
    pageCount: z.number().int().min(0),
  }),

  topics: z.array(topicSchema),
  pages: z.array(pageSchema),
  sources: z.array(sourceVideoSchema),

  navigation: z.object({
    primary: z.array(navItemSchema),
    secondary: z.array(navItemSchema),
  }),

  trust: z.object({
    methodologySummary: z.string().min(1),
    qualityPrinciples: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })),
    creationProcess: z.array(z.object({
      stepNumber: z.number().int().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
    })),
    faq: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })),
  }),

  highlights: z.array(highlightSchema).optional(),
  workbench: hubWorkbenchSchema.optional(),
});
export type EditorialAtlasManifest = z.infer<typeof editorialAtlasManifestSchema>;
