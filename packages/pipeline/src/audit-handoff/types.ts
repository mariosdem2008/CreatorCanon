import { z } from 'zod';

export const CREATOR_MANUAL_EDITABLE_KEYS = [
  'brand.name',
  'brand.tone',
  'brand.colors.background',
  'brand.colors.foreground',
  'brand.colors.surface',
  'brand.colors.elevated',
  'brand.colors.border',
  'brand.colors.muted',
  'brand.colors.accent',
  'brand.colors.accentForeground',
  'brand.colors.warning',
  'brand.colors.success',
  'brand.typography.headingFamily',
  'brand.typography.bodyFamily',
  'brand.assets.logoUrl',
  'brand.assets.heroImageUrl',
  'brand.assets.patternImageUrl',
  'brand.labels.evidence',
  'brand.labels.workshop',
  'brand.labels.library',
  'brand.radius',
  'brand.shadow',
  'positioning.tagline',
  'positioning.homeHeadline',
  'positioning.homeSummary',
  'motion.intensity',
] as const;

const safeShadowValues = [
  'none',
  '0 18px 60px rgba(15, 23, 42, 0.12)',
  '0 18px 60px rgba(22, 21, 19, 0.14)',
  '0 20px 70px rgba(15, 23, 42, 0.12)',
  '0 24px 80px rgba(15, 23, 42, 0.14)',
] as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const httpUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Expected an http(s) URL.');
const typographyFamily = z.string().min(1).max(160).regex(/^[A-Za-z0-9 ,'"_-]+$/);
const radiusToken = z
  .string()
  .min(1)
  .max(32)
  .regex(/^(?:0|(?:\d+(?:\.\d+)?(?:px|rem))|none|sm|md|lg|xl|full)$/);
const shadowToken = z.enum(safeShadowValues);
const editableKey = z.enum(CREATOR_MANUAL_EDITABLE_KEYS);

export const creatorManualDesignSpecSchema = z.object({
  version: z.literal(1),
  brand: z.object({
    name: z.string().min(1).max(120),
    tone: z.string().min(1).max(240),
    colors: z.object({
      background: hexColor,
      foreground: hexColor,
      surface: hexColor,
      elevated: hexColor,
      border: hexColor,
      muted: hexColor,
      accent: hexColor,
      accentForeground: hexColor,
      warning: hexColor,
      success: hexColor,
      typeMap: z.record(z.string().regex(/^[a-z][a-z0-9_-]*$/), hexColor).default({}),
    }),
    typography: z.object({
      headingFamily: typographyFamily,
      bodyFamily: typographyFamily,
    }),
    assets: z
      .object({
        logoUrl: httpUrl.optional(),
        heroImageUrl: httpUrl.optional(),
        patternImageUrl: httpUrl.optional(),
      })
      .default({}),
    style: z.object({ mode: z.enum(['light', 'dark', 'system', 'custom']) }),
    labels: z.object({
      evidence: z.string().min(1),
      workshop: z.string().min(1),
      library: z.string().min(1),
    }),
    radius: radiusToken,
    shadow: shadowToken,
  }),
  positioning: z.object({
    tagline: z.string().min(1).max(240),
    homeHeadline: z.string().min(1).max(160),
    homeSummary: z.string().min(1).max(420),
  }),
  motion: z.object({
    intensity: z.enum(['subtle', 'standard', 'expressive']),
    principles: z.array(z.string().min(1)).min(1).max(6),
  }),
  customization: z.object({
    editableKeys: z.array(editableKey).min(1).max(CREATOR_MANUAL_EDITABLE_KEYS.length),
  }),
});

export type CreatorManualDesignSpec = z.infer<typeof creatorManualDesignSpecSchema>;

export interface CreatorManualHubMetadata {
  tagline: string;
  homeHeadline: string;
  homeSummary: string;
  brand: CreatorManualDesignSpec['brand'];
  designSpec: {
    version: 1;
    customization: CreatorManualDesignSpec['customization'];
    motion: CreatorManualDesignSpec['motion'];
  };
}

export function normalizeDesignSpecForHubMetadata(
  spec: CreatorManualDesignSpec,
): CreatorManualHubMetadata {
  const parsed = creatorManualDesignSpecSchema.parse(spec);

  return {
    tagline: parsed.positioning.tagline,
    homeHeadline: parsed.positioning.homeHeadline,
    homeSummary: parsed.positioning.homeSummary,
    brand: parsed.brand,
    designSpec: {
      version: parsed.version,
      customization: parsed.customization,
      motion: parsed.motion,
    },
  };
}
