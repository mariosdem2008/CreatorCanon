import { z } from 'zod';

import { findCreatorManualManifestPublicTextIssues } from './sanitize';

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const idSchema = z.string().min(1);
const publicUrlUnsafeCharsPattern = /[\s"'()<>\\]/;
const cssForbiddenFunctionPattern = /\b(?:url|image-set|cross-fade|paint|expression|import)\s*\(/i;
const typographyFamilyPattern = /^[A-Za-z0-9 ,'"()_-]+$/;
const radiusTokenPattern = /^(?:0|(?:\d+(?:\.\d+)?(?:px|rem))|none|sm|md|lg|xl|full)$/;
const shadowLength = String.raw`(?:0|-?\d+(?:\.\d+)?px)`;
const shadowColor = String.raw`(?:#[0-9a-fA-F]{6}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|0?\.\d+|1(?:\.0+)?)\s*\))`;
const shadowTokenPattern = new RegExp(
  `^(?:none|${shadowLength}\\s+${shadowLength}(?:\\s+${shadowLength}){0,2}\\s+${shadowColor})$`,
);

const isSafePublicUrl = (value: string) => {
  const trimmed = value.trim();
  if (publicUrlUnsafeCharsPattern.test(trimmed)) return false;

  if (trimmed.startsWith('/')) {
    return /^\/(?!\/)[^\s"'()<>\\]*$/.test(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const publicUrlSchema = z.string().trim().min(1).refine(isSafePublicUrl, {
  message: 'Expected an http(s) URL or root-relative path.',
});

const optionalUrlSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  publicUrlSchema.optional(),
);

const recordTagSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z][a-z0-9_-]*$/);
const colorTokenSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/);
const typographyFamilySchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(typographyFamilyPattern)
  .refine((value) => !cssForbiddenFunctionPattern.test(value), {
    message: 'Unsafe font token.',
  });
const radiusTokenSchema = z.string().trim().min(1).max(32).regex(radiusTokenPattern);
const shadowTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine((value) => shadowTokenPattern.test(value), {
    message: 'Unsafe shadow token.',
  });

export const creatorManualEvidenceRefSchema = z.object({
  sourceId: idSchema,
  segmentId: idSchema.optional(),
  timestampStart: z.number().int().min(0).optional(),
  timestampEnd: z.number().int().min(0).optional(),
  note: z.string().min(1).optional(),
});
export type CreatorManualEvidenceRef = z.infer<typeof creatorManualEvidenceRefSchema>;

export const creatorManualNavItemSchema = z.object({
  label: z.string().min(1),
  routeKey: z.enum([
    'home',
    'library',
    'pillars',
    'sources',
    'segments',
    'claims',
    'glossary',
    'themes',
    'workshop',
    'search',
  ]),
});
export type CreatorManualNavItem = z.infer<typeof creatorManualNavItemSchema>;

export const creatorManualNodeSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  type: recordTagSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  pillarIds: z.array(idSchema),
  themeIds: z.array(idSchema),
  claimIds: z.array(idSchema),
  evidence: z.array(creatorManualEvidenceRefSchema),
});
export type CreatorManualNode = z.infer<typeof creatorManualNodeSchema>;

export const creatorManualPillarSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
  sections: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
      }),
    )
    .optional(),
  nodeIds: z.array(idSchema),
  claimIds: z.array(idSchema),
  evidence: z.array(creatorManualEvidenceRefSchema),
});
export type CreatorManualPillar = z.infer<typeof creatorManualPillarSchema>;

export const creatorManualSourceSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  creatorName: z.string().min(1),
  platform: z.enum(['youtube', 'podcast', 'article', 'workshop', 'other']),
  youtubeId: z.string().min(1).nullable(),
  url: optionalUrlSchema,
  thumbnailUrl: optionalUrlSchema,
  publishedAt: z.string().datetime().nullable(),
  durationSec: z.number().int().min(0).nullable(),
  summary: z.string().min(1),
  segmentIds: z.array(idSchema),
});
export type CreatorManualSource = z.infer<typeof creatorManualSourceSchema>;

export const creatorManualSegmentSchema = z.object({
  id: idSchema,
  sourceId: idSchema,
  slug: slugSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  timestampStart: z.number().int().min(0),
  timestampEnd: z.number().int().min(0),
  transcriptExcerpt: z.string().min(1),
  nodeIds: z.array(idSchema),
  claimIds: z.array(idSchema),
});
export type CreatorManualSegment = z.infer<typeof creatorManualSegmentSchema>;

export const creatorManualClaimSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  statement: z.string().min(1),
  confidence: z.enum(['strong', 'moderate', 'developing']),
  evidence: z.array(creatorManualEvidenceRefSchema),
  relatedNodeIds: z.array(idSchema),
});
export type CreatorManualClaim = z.infer<typeof creatorManualClaimSchema>;

export const creatorManualGlossaryEntrySchema = z.object({
  id: idSchema,
  term: z.string().min(1),
  slug: slugSchema,
  definition: z.string().min(1),
  relatedNodeIds: z.array(idSchema),
});
export type CreatorManualGlossaryEntry = z.infer<typeof creatorManualGlossaryEntrySchema>;

export const creatorManualThemeSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  nodeIds: z.array(idSchema),
  pillarIds: z.array(idSchema),
  evidence: z.array(creatorManualEvidenceRefSchema),
});
export type CreatorManualTheme = z.infer<typeof creatorManualThemeSchema>;

export const creatorManualWorkshopStageSchema = z.object({
  id: idSchema,
  slug: slugSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  objective: z.string().min(1),
  steps: z
    .array(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
      }),
    )
    .min(1),
  nodeIds: z.array(idSchema),
  evidence: z.array(creatorManualEvidenceRefSchema),
});
export type CreatorManualWorkshopStage = z.infer<typeof creatorManualWorkshopStageSchema>;

export const creatorManualSearchDocSchema = z.object({
  id: idSchema,
  type: z.enum(['node', 'pillar', 'source', 'segment', 'claim', 'glossary', 'theme', 'workshop']),
  recordId: idSchema,
  slug: slugSchema.optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1).optional(),
  keywords: z.array(z.string().min(1)).optional(),
});
export type CreatorManualSearchDoc = z.infer<typeof creatorManualSearchDocSchema>;
export type CreatorManualSearchDocType = CreatorManualSearchDoc['type'];

export const creatorManualManifestSchema = z
  .object({
    schemaVersion: z.literal('creator_manual_v1'),
    template: z.object({
      id: z.literal('creator-manual'),
      version: z.number().int().min(1),
    }),
    hubId: idSchema,
    releaseId: idSchema,
    hubSlug: slugSchema,
    visibility: z.enum(['public', 'unlisted']),
    publishedAt: z.string().datetime().nullable(),
    generatedAt: z.string().datetime(),
    title: z.string().min(1),
    tagline: z.string().min(1),
    creator: z.object({
      name: z.string().min(1),
      handle: z.string().min(1),
      avatarUrl: optionalUrlSchema,
      portraitUrl: optionalUrlSchema,
      canonicalUrl: publicUrlSchema,
      tagline: z.string().min(1),
      thesis: z.string().min(1),
      about: z.string().min(1),
      voiceSummary: z.string().min(1),
    }),
    brand: z.object({
      name: z.string().min(1),
      tone: z.string().min(1),
      tokens: z.object({
        colors: z.object({
          background: colorTokenSchema,
          foreground: colorTokenSchema,
          surface: colorTokenSchema,
          elevated: colorTokenSchema,
          border: colorTokenSchema,
          muted: colorTokenSchema,
          accent: colorTokenSchema,
          accentForeground: colorTokenSchema,
          warning: colorTokenSchema,
          success: colorTokenSchema,
          typeMap: z.record(recordTagSchema, colorTokenSchema).optional(),
        }),
        typography: z.object({
          headingFamily: typographyFamilySchema,
          bodyFamily: typographyFamilySchema,
        }),
        radius: radiusTokenSchema,
        shadow: shadowTokenSchema,
      }),
      assets: z
        .object({
          logoUrl: optionalUrlSchema,
          heroImageUrl: optionalUrlSchema,
          patternImageUrl: optionalUrlSchema,
        })
        .optional(),
      style: z.object({
        mode: z.enum(['light', 'dark', 'system', 'custom']),
      }),
      labels: z.object({
        evidence: z.string().min(1).optional(),
        workshop: z.string().min(1).optional(),
        library: z.string().min(1).optional(),
      }),
    }),
    navigation: z.object({
      primary: z.array(creatorManualNavItemSchema),
      secondary: z.array(creatorManualNavItemSchema),
    }),
    home: z.object({
      eyebrow: z.string().min(1),
      headline: z.string().min(1),
      summary: z.string().min(1),
      featuredNodeIds: z.array(idSchema),
      featuredPillarIds: z.array(idSchema),
    }),
    stats: z.object({
      nodeCount: z.number().int().min(0),
      pillarCount: z.number().int().min(0),
      sourceCount: z.number().int().min(0),
      segmentCount: z.number().int().min(0),
      claimCount: z.number().int().min(0),
      glossaryCount: z.number().int().min(0),
    }),
    nodes: z.array(creatorManualNodeSchema),
    pillars: z.array(creatorManualPillarSchema),
    sources: z.array(creatorManualSourceSchema),
    segments: z.array(creatorManualSegmentSchema),
    claims: z.array(creatorManualClaimSchema),
    glossary: z.array(creatorManualGlossaryEntrySchema),
    themes: z.array(creatorManualThemeSchema),
    workshop: z.array(creatorManualWorkshopStageSchema),
    search: z.array(creatorManualSearchDocSchema),
  })
  .superRefine((manifest, ctx) => {
    const issues = findCreatorManualManifestPublicTextIssues(manifest);

    for (const issue of issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: `Unsafe public text (${issue.kind}): ${issue.match}`,
      });
    }
  });
export type CreatorManualManifest = z.infer<typeof creatorManualManifestSchema>;
