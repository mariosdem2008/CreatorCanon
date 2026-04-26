// apps/web/src/lib/hub/chat/schema.ts
//
// Zod + TypeScript types for the grounded-chat API (POST /h/[hubSlug]/ask/api).
// Mirrors the "Ask This Hub" contract from the design spec § 6.3.

import { z } from 'zod';

// ── Request ──
export const askRequestSchema = z.object({
  hubId: z.string().min(1),
  question: z.string().min(1).max(500),
  filters: z.object({
    topicSlugs: z.array(z.string().min(1)).default([]),
    sourceVideoIds: z.array(z.string().min(1)).default([]),
    pageIds: z.array(z.string().min(1)).default([]),
  }),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

// ── Response — successful answer ──
const answerCitationSchema = z.object({
  id: z.string().min(1),
  sourceVideoId: z.string().min(1),
  videoTitle: z.string().min(1),
  timestampStart: z.number().int().min(0),
  timestampEnd: z.number().int().min(0),
  timestampLabel: z.string().min(1),
  url: z.string().url(),
  excerpt: z.string().min(1),
});

const relatedPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(['lesson', 'framework', 'playbook']),
  slug: z.string().min(1),
});

const answerBulletSchema = z.object({
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1)),       // [] is valid; renderer warns
});

const successfulAnswerSchema = z.object({
  answer: z.object({
    summary: z.string().min(1),
    bullets: z.array(answerBulletSchema),
    confidence: z.enum(['strong', 'moderate', 'limited']),
    evidenceQuality: z.enum(['strong', 'moderate', 'limited']),
    limitations: z.string().nullable(),
  }),
  citations: z.array(answerCitationSchema),
  relatedPages: z.array(relatedPageSchema),
  suggestedFollowups: z.array(z.string().min(1)),
});

// ── Response — unsupported ──
const partialMatchSchema = z.object({
  type: z.enum(['topic', 'page', 'source']),
  title: z.string().min(1),
  slug: z.string().min(1),
});

const unsupportedAnswerSchema = z.object({
  answer: z.literal(null),
  unsupported: z.literal(true),
  message: z.string().min(1),
  partialMatches: z.array(partialMatchSchema),
  suggestedSearches: z.array(z.string().min(1)),
});

// ── Discriminated union of the two response shapes ──
// Zod's discriminatedUnion needs a literal field, so we use `unsupported`.
// Successful responses are normalized to include `unsupported: false` on the
// wire by the route handler — the schema below accepts either shape and the
// app code dispatches by checking `'answer' in response && response.answer`.

export const askResponseSchema = z.union([
  successfulAnswerSchema.extend({ unsupported: z.literal(false).optional() }),
  unsupportedAnswerSchema,
]);
export type AskResponse = z.infer<typeof askResponseSchema>;
