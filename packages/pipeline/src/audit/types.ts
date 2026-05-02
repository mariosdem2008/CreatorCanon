import { z } from 'zod';

const scoreSchema = z.number().int().min(0).max(100);

export const auditReportSchema = z.object({
  version: z.literal(1),
  channel: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    handle: z.string().nullable(),
    url: z.string().url(),
    thumbnailUrl: z.string().url().nullable(),
  }),
  scanned: z.object({
    videoCount: z.number().int().nonnegative(),
    transcriptCount: z.number().int().nonnegative(),
    publicDataOnly: z.literal(true),
  }),
  scores: z.object({
    overall: scoreSchema,
    knowledgeDensity: scoreSchema,
    sourceDepth: scoreSchema,
    positioningClarity: scoreSchema,
    monetizationPotential: scoreSchema,
  }),
  positioning: z.object({
    oneLineRead: z.string().min(1),
    audience: z.string().min(1),
    authorityAngle: z.string().min(1),
  }),
  inventory: z.object({
    frameworks: z.array(z.string().min(1)).max(8),
    playbooks: z.array(z.string().min(1)).max(8),
    proofMoments: z.array(z.string().min(1)).max(8),
    repeatedThemes: z.array(z.string().min(1)).max(10),
  }),
  blueprint: z.object({
    hubTitle: z.string().min(1),
    tracks: z
      .array(
        z.object({
          title: z.string().min(1),
          description: z.string().min(1),
          candidatePages: z.array(z.string().min(1)).min(1).max(5),
        }),
      )
      .min(3)
      .max(6),
    sampleLesson: z.object({
      title: z.string().min(1),
      promise: z.string().min(1),
      sourceVideoIds: z.array(z.string().min(1)).min(1).max(4),
    }),
  }),
  monetization: z.object({
    leadMagnet: z.string().min(1),
    paidHub: z.string().min(1),
    authorityOffer: z.string().min(1),
    priority: z.string().min(1),
  }),
  gaps: z
    .array(
      z.object({
        label: z.string().min(1),
        severity: z.enum(['low', 'medium', 'high']),
        fix: z.string().min(1),
      }),
    )
    .max(8),
  creatorCanonFit: z.object({
    summary: z.string().min(1),
    buildPlan: z.array(z.string().min(1)).min(3).max(6),
    cta: z.string().min(1),
  }),
  auditMemo: z.object({
    headlineFinding: z.string().min(1),
    bestFirstHub: z.string().min(1),
    whatINoticed: z.object({
      summary: z.string().min(1),
      repeatedTopics: z.array(z.string().min(1)).min(3).max(6),
      currentFriction: z.array(z.string().min(1)).min(3).max(6),
      opportunity: z.string().min(1),
    }),
    fitScoreRows: z
      .array(
        z.object({
          signal: z.string().min(1),
          score: z.number().min(0).max(10),
          whyItMatters: z.string().min(1),
        }),
      )
      .min(4)
      .max(5),
    recommendedHub: z.object({
      name: z.string().min(1),
      targetAudience: z.string().min(1),
      outcome: z.string().min(1),
      whyThisFirst: z.string().min(1),
      firstPages: z.array(z.string().min(1)).min(5).max(7),
    }),
    examplePage: z.object({
      title: z.string().min(1),
      simpleSummary: z.string().min(1),
      recommendedPath: z.array(z.string().min(1)).min(4).max(7),
      archiveConnection: z.string().min(1),
      sourceVideosUsed: z
        .array(z.object({ videoId: z.string().min(1), title: z.string().min(1) }))
        .min(1)
        .max(3),
      takeaways: z.array(z.string().min(1)).min(3).max(5),
    }),
    businessUses: z.object({
      leadMagnet: z.string().min(1),
      paidMiniProduct: z.string().min(1),
      courseSupport: z.string().min(1),
      authorityAsset: z.string().min(1),
    }),
  }),
});

export type AuditReport = z.infer<typeof auditReportSchema>;
export type AuditScores = AuditReport['scores'];

export class ArchiveAuditError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message = code, opts: { retryable?: boolean; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = 'ArchiveAuditError';
    this.code = code;
    this.retryable = opts.retryable ?? false;
  }
}

export function isArchiveAuditError(error: unknown): error is ArchiveAuditError {
  return error instanceof ArchiveAuditError;
}
