import { createHmac, randomUUID } from 'node:crypto';

import {
  createOpenAIClient,
  createPublicYouTubeClient,
  type PublicYouTubeChannel,
  type PublicYouTubeVideo,
} from '@creatorcanon/adapters';
import { and, count, eq, getDb, gte, sql } from '@creatorcanon/db';
import { archiveAudit } from '@creatorcanon/db/schema';
import { isCanonError } from '@creatorcanon/core';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { buildArchiveAuditPrompt, buildArchiveAuditRepairPrompt } from './prompt';
import { calculateAuditScores, buildScoreInputs } from './scoring';
import { selectVideosForAudit } from './sampling';
import { fetchTranscriptSamples, type PublicTranscriptSample } from './transcripts';
import { ArchiveAuditError, auditReportSchema, type AuditReport, type AuditScores } from './types';
import { parseYouTubeChannelInput } from './url';

export interface RunArchiveAuditInput {
  channelUrl: string;
  ipAddress?: string;
}

export interface RunArchiveAuditResult {
  auditId: string;
  report: AuditReport;
}

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const archiveAuditEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  ARCHIVE_AUDIT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  YOUTUBE_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_API_KEY: z.string().min(1),
  ARCHIVE_AUDIT_MODEL: z.string().min(1).default('gpt-4o-mini'),
  ARCHIVE_AUDIT_DAILY_LIMIT_PER_IP: z.coerce.number().int().positive().default(3),
  ARCHIVE_AUDIT_MAX_PUBLIC_VIDEOS: z.coerce.number().int().positive().default(24),
  ARCHIVE_AUDIT_MAX_TRANSCRIPTS: z.coerce.number().int().positive().default(4),
  ARCHIVE_AUDIT_MAX_PROMPT_VIDEOS: z.coerce.number().int().positive().default(18),
  ARCHIVE_AUDIT_MAX_TRANSCRIPT_CHARS: z.coerce.number().int().positive().default(2400),
  ARCHIVE_AUDIT_MAX_VIDEO_DESCRIPTION_CHARS: z.coerce.number().int().positive().default(220),
  ARCHIVE_AUDIT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1800),
  ARCHIVE_AUDIT_REPAIR_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1200),
});

type ArchiveAuditEnv = z.infer<typeof archiveAuditEnvSchema>;

export function parseArchiveAuditEnv(raw: NodeJS.ProcessEnv): ArchiveAuditEnv {
  const parsed = archiveAuditEnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ArchiveAuditError(
      'archive_audit_config_missing',
      'Archive audit server configuration is incomplete.',
      { cause: parsed.error },
    );
  }

  if (!parsed.data.ARCHIVE_AUDIT_SECRET && !parsed.data.AUTH_SECRET) {
    throw new ArchiveAuditError('archive_audit_config_missing', 'Archive audit secret is missing.');
  }

  return parsed.data;
}

export async function runArchiveAudit(input: RunArchiveAuditInput): Promise<RunArchiveAuditResult> {
  const parsedUrl = parseYouTubeChannelInput(input.channelUrl);
  const env = parseArchiveAuditEnv(process.env);

  if (!env.YOUTUBE_API_KEY) {
    throw new ArchiveAuditError('youtube_api_key_missing', 'Archive audits are not enabled.');
  }

  const db = getDb(env.DATABASE_URL);
  const ipHash = hashAuditIp(input.ipAddress, env.ARCHIVE_AUDIT_SECRET ?? env.AUTH_SECRET!);
  const auditId = await reserveDailyAuditSlot(db, {
    inputUrl: input.channelUrl,
    ipHash,
    limit: env.ARCHIVE_AUDIT_DAILY_LIMIT_PER_IP,
  });

  try {
    await db
      .update(archiveAudit)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(archiveAudit.id, auditId));

    const youtube = createPublicYouTubeClient(env.YOUTUBE_API_KEY);
    const channel = await youtube.resolveChannel(parsedUrl);
    const videos = await youtube.listPublicChannelVideos({
      uploadsPlaylistId: channel.uploadsPlaylistId,
      maxResults: env.ARCHIVE_AUDIT_MAX_PUBLIC_VIDEOS,
    });
    if (videos.length === 0) {
      throw new ArchiveAuditError('no_public_videos', 'That channel does not show public videos.');
    }

    const sampledVideos = selectVideosForAudit(videos, env.ARCHIVE_AUDIT_MAX_TRANSCRIPTS);
    const transcripts = await fetchTranscriptSamples(sampledVideos, {
      maxCharsPerTranscript: env.ARCHIVE_AUDIT_MAX_TRANSCRIPT_CHARS,
    });
    const scores = calculateAuditScores(
      buildScoreInputs({ channel, videos, transcripts: transcripts.samples }),
    );
    const report = await generateAuditReport({
      channel,
      videos,
      sampledVideos,
      transcripts: transcripts.samples,
      unavailableTranscriptVideoIds: transcripts.unavailableVideoIds,
      scores,
      model: env.ARCHIVE_AUDIT_MODEL,
      openAiApiKey: env.OPENAI_API_KEY,
      maxPromptVideos: env.ARCHIVE_AUDIT_MAX_PROMPT_VIDEOS,
      maxTranscriptChars: env.ARCHIVE_AUDIT_MAX_TRANSCRIPT_CHARS,
      maxVideoDescriptionChars: env.ARCHIVE_AUDIT_MAX_VIDEO_DESCRIPTION_CHARS,
      maxOutputTokens: env.ARCHIVE_AUDIT_MAX_OUTPUT_TOKENS,
      repairMaxOutputTokens: env.ARCHIVE_AUDIT_REPAIR_MAX_OUTPUT_TOKENS,
    });

    await db
      .update(archiveAudit)
      .set({
        status: 'succeeded',
        canonicalChannelUrl: channel.canonicalUrl,
        channelId: channel.id,
        channelTitle: channel.title,
        channelHandle: channel.handle ?? null,
        videoCountScanned: videos.length,
        transcriptCountScanned: transcripts.samples.length,
        report,
        completedAt: new Date(),
      })
      .where(eq(archiveAudit.id, auditId));

    return { auditId, report };
  } catch (error) {
    const auditError = toArchiveAuditError(error);
    await db
      .update(archiveAudit)
      .set({
        status: 'failed',
        errorCode: auditError.code,
        errorMessage: auditError.message,
        completedAt: new Date(),
      })
      .where(eq(archiveAudit.id, auditId));
    throw auditError;
  }
}

export function hashAuditIp(ipAddress: string | undefined, secret: string): string {
  const value = ipAddress?.trim() || 'unknown';
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 48);
}

export function buildAuditReportJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(auditReportSchema, { $refStrategy: 'none' }) as Record<
    string,
    unknown
  >;
  delete schema.$schema;
  return schema;
}

async function reserveDailyAuditSlot(
  db: ReturnType<typeof getDb>,
  input: { inputUrl: string; ipHash: string; limit: number },
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.ipHash}, 0::bigint))`,
    );

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await tx
      .select({ total: count() })
      .from(archiveAudit)
      .where(and(eq(archiveAudit.ipHash, input.ipHash), gte(archiveAudit.createdAt, since)));

    if (Number(row?.total ?? 0) >= input.limit) {
      throw new ArchiveAuditError('daily_limit_reached', 'Free audit limit reached.');
    }

    const auditId = createAuditId();
    await tx.insert(archiveAudit).values({
      id: auditId,
      status: 'queued',
      inputUrl: input.inputUrl,
      ipHash: input.ipHash,
    });

    return auditId;
  });
}

async function generateAuditReport(input: {
  channel: PublicYouTubeChannel;
  videos: PublicYouTubeVideo[];
  sampledVideos: PublicYouTubeVideo[];
  transcripts: PublicTranscriptSample[];
  unavailableTranscriptVideoIds: string[];
  scores: AuditScores;
  model: string;
  openAiApiKey: string;
  maxPromptVideos: number;
  maxTranscriptChars: number;
  maxVideoDescriptionChars: number;
  maxOutputTokens: number;
  repairMaxOutputTokens: number;
}): Promise<AuditReport> {
  const openai = createOpenAIClient({
    OPENAI_API_KEY: input.openAiApiKey,
  } as Parameters<typeof createOpenAIClient>[0]);
  const schema = buildAuditReportJsonSchema();
  const promptInput = {
    channel: input.channel,
    videos: input.videos,
    sampledVideos: input.sampledVideos,
    transcripts: input.transcripts,
    scores: input.scores,
    unavailableTranscriptVideoIds: input.unavailableTranscriptVideoIds,
  };

  const completion = await openai.chat({
    model: input.model,
    temperature: 0.2,
    maxTokens: input.maxOutputTokens,
    messages: buildArchiveAuditPrompt(promptInput, {
      maxPromptVideos: input.maxPromptVideos,
      maxChannelDescriptionChars: 360,
      maxVideoDescriptionChars: input.maxVideoDescriptionChars,
      maxTranscriptChars: input.maxTranscriptChars,
    }),
    jsonSchema: { name: 'creatorcanon_archive_audit', schema, strict: false },
    userInteraction: 'archive_audit',
  });

  try {
    return normalizeModelReport(parseModelJson(completion.content), input);
  } catch {
    const repaired = await openai.chat({
      model: input.model,
      temperature: 0,
      maxTokens: input.repairMaxOutputTokens,
      messages: buildArchiveAuditRepairPrompt(completion.content),
      jsonSchema: { name: 'creatorcanon_archive_audit', schema, strict: false },
      userInteraction: 'archive_audit',
    });
    try {
      return normalizeModelReport(parseModelJson(repaired.content), input);
    } catch {
      return normalizeModelReport({}, input);
    }
  }
}

function parseModelJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(content.slice(start, end + 1));
    throw new Error('Model response did not contain JSON.');
  }
}

export function normalizeModelReport(
  value: unknown,
  input: {
    channel: PublicYouTubeChannel;
    videos: PublicYouTubeVideo[];
    transcripts: PublicTranscriptSample[];
    scores: AuditScores;
  },
): AuditReport {
  const title = input.channel.title || 'This creator';
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const report = auditReportSchema.safeParse({
    ...fallbackAuditReport(input, title),
    ...candidate,
    version: 1,
    channel: {
      id: input.channel.id,
      title,
      handle: input.channel.handle ?? null,
      url: input.channel.canonicalUrl,
      thumbnailUrl: input.channel.thumbnailUrl ?? null,
    },
    scanned: {
      videoCount: input.videos.length,
      transcriptCount: input.transcripts.length,
      publicDataOnly: true,
    },
    scores: input.scores,
  });
  return report.success ? report.data : fallbackAuditReport(input, title);
}

function fallbackAuditReport(
  input: {
    channel: PublicYouTubeChannel;
    videos: PublicYouTubeVideo[];
    transcripts: PublicTranscriptSample[];
    scores: AuditScores;
  },
  title: string,
): AuditReport {
  const firstVideo = input.videos[0];
  const firstVideoId = firstVideo?.id ?? 'unknown';
  const firstVideoTitle = firstVideo?.title ?? 'Source video';
  const themes = deriveThemeSeeds(input.videos);
  const repeatedTopics = fillList(
    themes,
    ['Core roadmap', 'Common mistakes', 'Implementation'],
    3,
    6,
  );

  return {
    version: 1,
    channel: {
      id: input.channel.id,
      title,
      handle: input.channel.handle ?? null,
      url: input.channel.canonicalUrl,
      thumbnailUrl: input.channel.thumbnailUrl ?? null,
    },
    scanned: {
      videoCount: input.videos.length,
      transcriptCount: input.transcripts.length,
      publicDataOnly: true,
    },
    scores: input.scores,
    positioning: {
      oneLineRead: `${title}'s archive can become a source-backed manual.`,
      audience: `Viewers who want practical guidance from ${title}.`,
      authorityAngle: 'The archive creates a public source trail for reusable ideas.',
    },
    inventory: {
      frameworks: repeatedTopics.slice(0, 3),
      playbooks: ['Source-backed lesson library'],
      proofMoments: ['Public archive examples'],
      repeatedThemes: repeatedTopics,
    },
    blueprint: {
      hubTitle: `${title} Manual`,
      tracks: [
        { title: 'Start', description: 'Core orientation.', candidatePages: ['Overview'] },
        { title: 'Build', description: 'Operating systems.', candidatePages: ['Systems'] },
        { title: 'Scale', description: 'Growth loops.', candidatePages: ['Growth'] },
      ],
      sampleLesson: {
        title: firstVideoTitle,
        promise: 'Turn a high-signal archive idea into a source-backed lesson.',
        sourceVideoIds: [firstVideoId],
      },
    },
    monetization: {
      leadMagnet: 'A source-backed checklist from the strongest archive theme.',
      paidHub: 'A structured paid manual.',
      authorityOffer: 'Advisory support anchored in proven frameworks.',
      priority: 'Build the first focused hub.',
    },
    gaps:
      input.transcripts.length === 0
        ? [
            {
              label: 'Transcript coverage',
              severity: 'high',
              fix: 'Connect the channel for deeper extraction.',
            },
          ]
        : [],
    creatorCanonFit: {
      summary: 'CreatorCanon can turn this archive into a structured, cited hub.',
      buildPlan: ['Pick sources.', 'Generate canon.', 'Publish manual.'],
      cta: 'Build the hub',
    },
    auditMemo: {
      headlineFinding: 'The archive can become a manual.',
      bestFirstHub: `${title} Manual`,
      whatINoticed: {
        summary: 'Clear repeated themes appear across the archive.',
        repeatedTopics,
        currentFriction: ['Archive is scattered', 'No guided path', 'Weak citation surface'],
        opportunity: 'Package the operating system.',
      },
      fitScoreRows: [
        { signal: 'Useful archive depth', score: 8, whyItMatters: 'Enough videos.' },
        { signal: 'Evergreen value', score: 8, whyItMatters: 'Durable topics.' },
        { signal: 'Audience pain', score: 8, whyItMatters: 'Clear pain.' },
        { signal: 'Product potential', score: 8, whyItMatters: 'Strong use case.' },
      ],
      recommendedHub: {
        name: `${title} Manual`,
        targetAudience: `Viewers of ${title}`,
        outcome: 'Build better systems.',
        whyThisFirst: 'It is focused.',
        firstPages: ['Overview', ...repeatedTopics, 'Systems'].slice(0, 7),
      },
      examplePage: {
        title: firstVideoTitle,
        simpleSummary: 'A practical source-backed page.',
        recommendedPath: ['Watch', 'Extract', 'Apply', 'Review'],
        archiveConnection: 'Uses the strongest source videos.',
        sourceVideosUsed: [{ videoId: firstVideoId, title: firstVideoTitle }],
        takeaways: ['Clarify the idea', 'Name the outcome', 'Apply it'],
      },
      businessUses: {
        leadMagnet: 'Checklist',
        paidMiniProduct: 'Paid manual',
        courseSupport: 'Course companion',
        authorityAsset: 'Public proof hub',
      },
    },
  };
}

function createAuditId(): string {
  return `aa_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function deriveThemeSeeds(videos: PublicYouTubeVideo[]): string[] {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'your',
    'you',
    'how',
    'why',
    'what',
    'from',
    'into',
    'about',
  ]);
  const counts = new Map<string, number>();
  for (const video of videos) {
    const terms = video.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length > 3 && !stop.has(term));
    for (const term of new Set(terms)) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => `${term.slice(0, 1).toUpperCase()}${term.slice(1)}`)
    .slice(0, 6);
}

function fillList(
  items: string[],
  defaults: string[],
  minItems: number,
  maxItems: number,
): string[] {
  const out = [...items.filter(Boolean)];
  for (const item of defaults) {
    if (out.length >= minItems) break;
    if (!out.some((existing) => existing.toLowerCase() === item.toLowerCase())) out.push(item);
  }
  return out.slice(0, maxItems);
}

function toArchiveAuditError(error: unknown): ArchiveAuditError {
  if (error instanceof ArchiveAuditError) return error;
  if (isCanonError(error)) {
    return new ArchiveAuditError(error.code, error.message, {
      cause: error,
      retryable: error.retryable,
    });
  }
  return new ArchiveAuditError('audit_generation_failed', 'Archive audit failed.', {
    cause: error,
    retryable: true,
  });
}
