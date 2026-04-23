import { and, asc, eq, getDb } from '@creatorcanon/db';
import {
  generationStageRun,
  page,
  pageBlock,
  pageVersion,
  project,
  segment,
  video,
} from '@creatorcanon/db/schema';
import { artifactKey, createOpenAIClient, createR2Client, type OpenAIClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { z } from 'zod';
import {
  type DraftPagesV0Artifact,
  type DraftPagesV0Page,
  type DraftPagesV0Section,
  type DraftPagesV0StageOutput,
  type SourceReferenceV0,
  draftPagesV0ArtifactSchema,
  v0ReviewArtifactSchema,
  v0ReviewStageOutputSchema,
} from '../contracts';

export interface DraftPagesV0Config {
  tone?: string | null;
  length_preset?: 'short' | 'standard' | 'deep' | string | null;
  audience?: string | null;
}

export interface DraftPagesV0Input {
  runId: string;
  projectId: string;
  workspaceId: string;
  config?: DraftPagesV0Config | null;
}

interface ReviewArtifactVideo {
  videoId: string;
  youtubeVideoId?: string;
  title: string | null;
  summary: string;
  segmentCount: number;
}

type SourceRefByVideo = Map<string, SourceReferenceV0[]>;
type DraftBlock = {
  type: string;
  id: string;
  content: unknown;
  citations: string[];
  supportLabel?: 'strong' | 'review_recommended' | 'limited';
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'untitled-page';
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}...`;
}

function formatTimestampUrl(youtubeVideoId: string, startMs: number): string {
  const seconds = Math.max(0, Math.floor(startMs / 1000));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId)}&t=${seconds}s`;
}

function buildQuote(text: string): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), 180);
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function groupVideos<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function pickPageCount(videoCount: number, totalSegmentCount: number): number {
  if (totalSegmentCount < 3 || videoCount <= 1) return 1;
  if (videoCount <= 3 || totalSegmentCount < 8) return 2;
  if (videoCount <= 6 || totalSegmentCount < 14) return 3;
  if (videoCount <= 10 || totalSegmentCount < 24) return 4;
  return 5;
}

function buildOverviewPage(input: {
  archiveSummary: string;
  themes: string[];
  videos: ReviewArtifactVideo[];
}): DraftPagesV0Page {
  const themeLine = input.themes.length > 0
    ? `Recurring themes included ${input.themes.slice(0, 4).join(', ')}.`
    : 'Repeated themes were weak, so Atlas kept the overview broad.';

  return {
    slug: 'overview',
    title: 'Archive Overview',
    summary: truncate(input.archiveSummary, 220),
    sections: [
      {
        heading: 'What This Archive Covers',
        body: truncate(`${input.archiveSummary} ${themeLine}`, 480),
        sourceVideoIds: input.videos.map((video) => video.videoId),
      },
    ],
  };
}

function buildVideoSection(video: ReviewArtifactVideo): DraftPagesV0Section {
  return {
    heading: video.title ?? 'Untitled source video',
    body: truncate(video.summary, 420),
    sourceVideoIds: [video.videoId],
  };
}

function buildThemePages(input: {
  archiveSummary: string;
  themes: string[];
  videos: ReviewArtifactVideo[];
  pageCount: number;
}): DraftPagesV0Page[] {
  const pages: DraftPagesV0Page[] = [];
  pages.push(buildOverviewPage(input));

  const remainingSlots = Math.max(0, input.pageCount - 1);
  if (remainingSlots === 0) return pages;

  const videosWithContent = input.videos.filter((video) => video.segmentCount > 0);
  const fallbackVideos = videosWithContent.length > 0 ? videosWithContent : input.videos;
  const groupSize = Math.max(1, Math.ceil(fallbackVideos.length / remainingSlots));
  const groups = groupVideos(fallbackVideos, groupSize).slice(0, remainingSlots);

  groups.forEach((group, index) => {
    const theme = input.themes[index];
    const title = theme
      ? `${titleCase(theme)} Playbook`
      : `Topic ${index + 1}`;
    const summary = truncate(
      group.map((video) => video.summary).join(' '),
      220,
    );

    pages.push({
      slug: slugify(theme ? `${index + 1}-${theme}` : `topic-${index + 1}`),
      title,
      summary: summary || 'Atlas grouped these source videos into a first-pass draft page.',
      sections: group.map(buildVideoSection),
    });
  });

  return pages;
}

function buildDraftPages(input: {
  archiveSummary: string;
  themes: string[];
  videos: ReviewArtifactVideo[];
  totalSegmentCount: number;
}): DraftPagesV0Page[] {
  if (input.totalSegmentCount === 0) {
    return [
      {
        slug: 'overview',
        title: 'Archive Overview',
        summary: 'Not enough transcript material was available to generate detailed draft pages yet.',
        sections: [
          {
            heading: 'Current status',
            body: truncate(input.archiveSummary, 420),
            sourceVideoIds: input.videos.map((video) => video.videoId),
          },
        ],
      },
    ];
  }

  const pageCount = pickPageCount(input.videos.length, input.totalSegmentCount);
  return buildThemePages({
    archiveSummary: input.archiveSummary,
    themes: input.themes,
    videos: input.videos,
    pageCount,
  });
}

const LENGTH_WORD_BUDGET: Record<string, number> = {
  short: 180,
  standard: 360,
  deep: 700,
};

const llmSectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  sourceVideoIds: z.array(z.string().min(1)).min(1),
});

const llmPageSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(llmSectionSchema).min(1).max(6),
});

type LlmPage = z.infer<typeof llmPageSchema>;

const llmResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'sections'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'body', 'sourceVideoIds'],
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
          sourceVideoIds: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

function wordBudget(lengthPreset: string | null | undefined): number {
  if (!lengthPreset) return LENGTH_WORD_BUDGET.standard!;
  return LENGTH_WORD_BUDGET[lengthPreset] ?? LENGTH_WORD_BUDGET.standard!;
}

interface PageSegmentContext {
  videoId: string;
  videoTitle: string | null;
  quotes: string[];
}

function buildPageSegmentContext(
  skeleton: DraftPagesV0Page,
  refsByVideo: SourceRefByVideo,
): PageSegmentContext[] {
  const skeletonVideoIds = new Set(
    skeleton.sections.flatMap((section) => section.sourceVideoIds),
  );
  const contexts: PageSegmentContext[] = [];
  for (const videoId of skeletonVideoIds) {
    const refs = refsByVideo.get(videoId) ?? [];
    if (refs.length === 0) continue;
    contexts.push({
      videoId,
      videoTitle: refs[0]?.title ?? null,
      quotes: refs.slice(0, 6).map((ref) => ref.quote),
    });
  }
  return contexts;
}

function buildLlmPrompt(args: {
  skeleton: DraftPagesV0Page;
  config: DraftPagesV0Config;
  segmentContext: PageSegmentContext[];
}): { system: string; user: string } {
  const tone = (args.config.tone ?? 'conversational').toString().trim() || 'conversational';
  const audience = (args.config.audience ?? 'general creators').toString().trim() || 'general creators';
  const lengthPreset = (args.config.length_preset ?? 'standard').toString();
  const budget = wordBudget(lengthPreset);

  const system =
    'You write one page of a creator-archive knowledge hub. Ground every claim in the provided transcript quotes. Do not invent facts, URLs, or new video IDs. Match the requested tone and length. Return JSON that conforms to the provided schema.';

  const sourcesBlock = args.segmentContext
    .map((ctx) => {
      const quoteList = ctx.quotes.map((quote, idx) => `  [${idx + 1}] "${quote}"`).join('\n');
      const heading = `VIDEO videoId=${ctx.videoId} title=${JSON.stringify(ctx.videoTitle ?? 'Untitled')}`;
      return `${heading}\n${quoteList}`;
    })
    .join('\n\n');

  const allowedVideoIds = args.segmentContext.map((ctx) => ctx.videoId);

  const user = [
    `tone: ${tone}`,
    `audience: ${audience}`,
    `length_preset: ${lengthPreset} (target ~${budget} words across all section bodies combined)`,
    '',
    `page_slug: ${args.skeleton.slug}`,
    `skeleton_title: ${args.skeleton.title}`,
    `skeleton_summary_seed: ${args.skeleton.summary}`,
    `allowed_sourceVideoIds (use ONLY these, at least one per section): ${JSON.stringify(allowedVideoIds)}`,
    '',
    'Transcript quotes grounded in the videos above. Use them to back the body prose — paraphrase, do not quote verbatim:',
    sourcesBlock || '(no quotes available; keep body brief and factual)',
    '',
    'Write:',
    `- title: a short headline (<= 60 chars) that reads like a real chapter, not a template.`,
    `- summary: 1-2 sentences (<= 220 chars) that set up the page for the ${audience}.`,
    `- sections: 1-4 sections. Each has a heading (<= 60 chars), a body (prose, bullets allowed as markdown, grounded in the quotes), and sourceVideoIds (a subset of allowed_sourceVideoIds with at least one id).`,
  ].join('\n');

  return { system, user };
}

function filterSourceVideoIds(
  candidate: string[],
  allowed: Set<string>,
  fallback: string[],
): string[] {
  const filtered = candidate.filter((id) => allowed.has(id));
  if (filtered.length > 0) return filtered;
  return fallback.length > 0 ? [fallback[0]!] : [];
}

function mergeLlmPage(
  skeleton: DraftPagesV0Page,
  llmPage: LlmPage,
  segmentContext: PageSegmentContext[],
): DraftPagesV0Page | null {
  const allowed = new Set(segmentContext.map((ctx) => ctx.videoId));
  const skeletonVideoIds = Array.from(
    new Set(skeleton.sections.flatMap((section) => section.sourceVideoIds)),
  );

  const sections: DraftPagesV0Section[] = [];
  for (const section of llmPage.sections) {
    const sourceVideoIds = filterSourceVideoIds(
      section.sourceVideoIds,
      allowed,
      skeletonVideoIds,
    );
    if (sourceVideoIds.length === 0) continue;
    sections.push({
      heading: section.heading.slice(0, 120),
      body: section.body,
      sourceVideoIds,
    });
  }

  if (sections.length === 0) return null;

  return {
    slug: skeleton.slug,
    title: llmPage.title.slice(0, 120),
    summary: llmPage.summary.slice(0, 480),
    sections,
  };
}

async function generateLlmPage(args: {
  skeleton: DraftPagesV0Page;
  config: DraftPagesV0Config;
  segmentContext: PageSegmentContext[];
  openai: OpenAIClient;
}): Promise<DraftPagesV0Page | null> {
  if (args.segmentContext.length === 0) return null;

  const { system, user } = buildLlmPrompt({
    skeleton: args.skeleton,
    config: args.config,
    segmentContext: args.segmentContext,
  });

  try {
    const completion = await args.openai.chat({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 900,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      jsonSchema: {
        name: 'draft_page_v0',
        schema: llmResponseJsonSchema as unknown as Record<string, unknown>,
        strict: true,
      },
    });

    if (!completion.content) return null;
    const parsedJson = JSON.parse(completion.content) as unknown;
    const parsed = llmPageSchema.safeParse(parsedJson);
    if (!parsed.success) return null;
    return mergeLlmPage(args.skeleton, parsed.data, args.segmentContext);
  } catch (err) {
    console.warn(
      `[draft_pages_v0] LLM page synthesis failed for slug=${args.skeleton.slug}, falling back to deterministic:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function buildLlmPages(args: {
  skeleton: DraftPagesV0Page[];
  config: DraftPagesV0Config;
  refsByVideo: SourceRefByVideo;
  openai: OpenAIClient;
}): Promise<DraftPagesV0Page[]> {
  const result: DraftPagesV0Page[] = [];
  for (const skeleton of args.skeleton) {
    const segmentContext = buildPageSegmentContext(skeleton, args.refsByVideo);
    const llmPage = await generateLlmPage({
      skeleton,
      config: args.config,
      segmentContext,
      openai: args.openai,
    });
    result.push(llmPage ?? skeleton);
  }
  return result;
}

async function loadSourceRefs(input: DraftPagesV0Input): Promise<SourceRefByVideo> {
  const db = getDb();
  const rows = await db
    .select({
      segmentId: segment.id,
      videoId: segment.videoId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
    })
    .from(segment)
    .innerJoin(video, eq(video.id, segment.videoId))
    .where(and(eq(segment.runId, input.runId), eq(segment.workspaceId, input.workspaceId)))
    .orderBy(asc(segment.videoId), asc(segment.startMs));

  const refsByVideo: SourceRefByVideo = new Map();
  for (const row of rows) {
    const ref: SourceReferenceV0 = {
      videoId: row.videoId,
      youtubeVideoId: row.youtubeVideoId,
      title: row.title,
      segmentId: row.segmentId,
      startMs: row.startMs,
      endMs: row.endMs,
      quote: buildQuote(row.text),
      url: row.youtubeVideoId ? formatTimestampUrl(row.youtubeVideoId, row.startMs) : null,
    };
    const refs = refsByVideo.get(row.videoId) ?? [];
    refs.push(ref);
    refsByVideo.set(row.videoId, refs);
  }

  return refsByVideo;
}

function attachSourceRefs(
  pagesToPersist: DraftPagesV0Page[],
  refsByVideo: SourceRefByVideo,
): DraftPagesV0Page[] {
  return pagesToPersist.map((draftPage) => ({
    ...draftPage,
    sections: draftPage.sections.map((section) => {
      const sourceRefs = section.sourceVideoIds
        .flatMap((videoId) => refsByVideo.get(videoId)?.slice(0, 1) ?? [])
        .slice(0, 3);

      return {
        ...section,
        sourceRefs,
      };
    }),
  }));
}

async function loadReviewArtifact(
  input: DraftPagesV0Input,
  r2: ReturnType<typeof createR2Client>,
) {
  const db = getDb();
  const reviewStageRows = await db
    .select({
      outputJson: generationStageRun.outputJson,
    })
    .from(generationStageRun)
    .where(
      and(
        eq(generationStageRun.runId, input.runId),
        eq(generationStageRun.stageName, 'synthesize_v0_review'),
        eq(generationStageRun.status, 'succeeded'),
      ),
    )
    .orderBy(asc(generationStageRun.createdAt));

  const latestStage = reviewStageRows.at(-1);
  if (!latestStage?.outputJson) {
    throw new Error('Cannot build draft pages before a review artifact exists for this run.');
  }

  const parsedOutput = v0ReviewStageOutputSchema.parse(latestStage.outputJson);
  const obj = await r2.getObject(parsedOutput.r2Key);
  const artifact = v0ReviewArtifactSchema.parse(
    JSON.parse(new TextDecoder().decode(obj.body)),
  );

  return { artifact };
}

async function replaceRunPages(input: DraftPagesV0Input, pagesToPersist: DraftPagesV0Page[]) {
  const db = getDb();
  const existingPages = await db
    .select({ id: page.id })
    .from(page)
    .where(and(eq(page.runId, input.runId), eq(page.workspaceId, input.workspaceId)));

  if (existingPages.length > 0) {
    await db
      .delete(page)
      .where(and(eq(page.runId, input.runId), eq(page.workspaceId, input.workspaceId)));
  }

  const projectRows = await db
    .select({ title: project.title })
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.workspaceId, input.workspaceId)))
    .limit(1);

  if (projectRows.length === 0) {
    throw new Error(`Project ${input.projectId} was not found for draft page persistence.`);
  }

  const persistedPageIds: string[] = [];

  for (const [pageIndex, draftPage] of pagesToPersist.entries()) {
    const pageId = crypto.randomUUID();
    const pageVersionId = crypto.randomUUID();
    const blocks: DraftBlock[] = [
      {
        type: 'summary',
        id: 'summary',
        content: {
          text: draftPage.summary,
        },
        citations: [],
      },
      ...draftPage.sections.map((section, sectionIndex) => ({
        type: 'section',
        id: `section-${sectionIndex + 1}`,
        content: section,
        citations: [],
        supportLabel: (section.sourceRefs?.length ?? 0) > 0 ? 'strong' as const : 'limited' as const,
      })),
    ];

    await db.insert(page).values({
      id: pageId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      slug: draftPage.slug,
      pageType: pageIndex === 0 ? 'topic_overview' : 'lesson',
      position: pageIndex,
      currentVersionId: pageVersionId,
      status: 'needs_review',
      supportLabel: 'review_recommended',
    });

    await db.insert(pageVersion).values({
      id: pageVersionId,
      workspaceId: input.workspaceId,
      pageId,
      runId: input.runId,
      version: 1,
      title: draftPage.title,
      subtitle: pageIndex === 0 ? projectRows[0]!.title : null,
      summary: draftPage.summary,
      blockTreeJson: {
        blocks,
      },
      authorKind: 'pipeline',
      isCurrent: true,
    });

    await db.insert(pageBlock).values(
      blocks.map((block, blockIndex) => ({
        id: crypto.randomUUID(),
        pageVersionId,
        blockId: block.id,
        blockType: block.type,
        position: blockIndex,
        content: block.content,
        citations: [],
        supportLabel: block.supportLabel ?? 'review_recommended',
      })),
    );

    persistedPageIds.push(pageId);
  }

  return persistedPageIds;
}

export async function draftPagesV0(
  input: DraftPagesV0Input,
): Promise<DraftPagesV0StageOutput> {
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const { artifact: reviewArtifact } = await loadReviewArtifact(input, r2);

  const skeleton = buildDraftPages({
    archiveSummary: reviewArtifact.archiveSummary,
    themes: reviewArtifact.themes,
    videos: reviewArtifact.videos,
    totalSegmentCount: reviewArtifact.totalSegmentCount,
  });

  const refsByVideo = await loadSourceRefs(input);

  const useLlm =
    env.PIPELINE_DRAFT_SYNTH === 'llm' &&
    reviewArtifact.totalSegmentCount > 0 &&
    !!input.config;

  const synthesizedPages = useLlm
    ? await buildLlmPages({
        skeleton,
        config: input.config!,
        refsByVideo,
        openai: createOpenAIClient(env),
      })
    : skeleton;

  const draftPages = attachSourceRefs(synthesizedPages, refsByVideo);

  const artifact: DraftPagesV0Artifact = draftPagesV0ArtifactSchema.parse({
    runId: input.runId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    generatedAt: new Date().toISOString(),
    pageCount: draftPages.length,
    pages: draftPages,
  });

  const pageIds = await replaceRunPages(input, artifact.pages);

  const r2Key = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'draft_pages_v0',
    name: 'pages.json',
  });

  await r2.putObject({
    key: r2Key,
    body: JSON.stringify(artifact, null, 2),
    contentType: 'application/json',
  });

  return {
    r2Key,
    pageCount: artifact.pageCount,
    pageIds,
  };
}
