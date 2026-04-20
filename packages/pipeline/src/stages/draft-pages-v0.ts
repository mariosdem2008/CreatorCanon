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
import { artifactKey, createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
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

export interface DraftPagesV0Input {
  runId: string;
  projectId: string;
  workspaceId: string;
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

async function loadReviewArtifact(input: DraftPagesV0Input) {
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
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const obj = await r2.getObject(parsedOutput.r2Key);
  const artifact = v0ReviewArtifactSchema.parse(
    JSON.parse(new TextDecoder().decode(obj.body)),
  );

  return { artifact, r2 };
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
  const { artifact: reviewArtifact, r2 } = await loadReviewArtifact(input);

  const draftPages = attachSourceRefs(buildDraftPages({
    archiveSummary: reviewArtifact.archiveSummary,
    themes: reviewArtifact.themes,
    videos: reviewArtifact.videos,
    totalSegmentCount: reviewArtifact.totalSegmentCount,
  }), await loadSourceRefs(input));

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
