import { z } from 'zod';

const accentColor = z.enum(['mint', 'peach', 'lilac', 'rose', 'blue', 'amber', 'sage', 'slate']);
const iconKey = z.enum([
  'productivity',
  'learning',
  'writing',
  'career',
  'systems',
  'mindset',
  'habits',
  'growth',
  'general',
]);

export const topicPayload = z.object({
  title: z.string().min(2).max(60),
  description: z.string().min(1).max(280),
  iconKey,
  accentColor,
});

const principle = z.object({ title: z.string().min(1), body: z.string().min(1) });
const step = z.object({ title: z.string().min(1), body: z.string().min(1) });

export const frameworkPayload = z.object({
  title: z.string().min(2).max(80),
  summary: z.string().min(1).max(600),
  principles: z.array(principle).min(1),
  steps: z.array(step).optional(),
});

export const lessonPayload = z.object({
  title: z.string().min(2).max(80),
  summary: z.string().min(1).max(600),
  idea: z.string().min(20),
});

export const playbookPayload = z.object({
  title: z.string().min(2).max(80),
  summary: z.string().min(1).max(600),
  principles: z.array(principle).min(1),
  scenes: z.array(step).optional(),
  workflow: z.array(z.object({ day: z.string(), items: z.array(z.string()).min(1) })).optional(),
  failurePoints: z.array(step).optional(),
});

export const quotePayload = z.object({
  text: z.string().min(10).max(280),
  attribution: z.string().optional(),
});

export const ahaMomentPayload = z.object({
  quote: z.string().min(10).max(280),
  context: z.string().min(20),
  attribution: z.string().optional(),
});

export const sourceRankingPayload = z.object({
  topicId: z.string().min(1),
  videoIds: z.array(z.string()).min(1),
});

export const FINDING_PAYLOAD_SCHEMAS = {
  topic: topicPayload,
  framework: frameworkPayload,
  lesson: lessonPayload,
  playbook: playbookPayload,
  quote: quotePayload,
  aha_moment: ahaMomentPayload,
  source_ranking: sourceRankingPayload,
} as const;
