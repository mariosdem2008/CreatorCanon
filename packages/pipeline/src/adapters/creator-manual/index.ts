import { asc, eq, getDb, inArray } from '@creatorcanon/db';
import {
  canonNode,
  channel,
  channelProfile,
  generationRun,
  hub,
  page,
  pageVersion,
  project,
  release,
  segment,
  video as videoTable,
  videoSetItem,
} from '@creatorcanon/db/schema';
import type { AdapterFn } from '../types';
import type {
  CreatorManualClaim,
  CreatorManualEvidenceRef,
  CreatorManualGlossaryEntry,
  CreatorManualManifest,
  CreatorManualNode,
  CreatorManualPillar,
  CreatorManualSearchDoc,
  CreatorManualSegment,
  CreatorManualSource,
  CreatorManualTheme,
  CreatorManualWorkshopStage,
} from './manifest-types';
import { excerpt, nonEmpty, seconds, slugify, sourceThumbnail, youtubeUrl } from './utils';

type JsonRecord = Record<string, unknown>;

type SegmentRow = {
  id: string;
  videoId: string;
  startMs: number;
  endMs: number;
  text: string;
  summary: string | null;
  tags: string[] | null;
};

type VideoRow = typeof videoTable.$inferSelect;
type CanonNodeRow = typeof canonNode.$inferSelect;
type ColorTokens = CreatorManualManifest['brand']['tokens']['colors'];

const uuidLikePattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const typeMapKeyPattern = /^[a-z][a-z0-9_-]*$/;
const colorOverrideFields = [
  'background',
  'foreground',
  'surface',
  'elevated',
  'border',
  'muted',
  'accent',
  'accentForeground',
  'warning',
  'success',
] as const;

const defaultColors: ColorTokens = {
  background: '#f8f5ef',
  foreground: '#191716',
  surface: '#fffaf2',
  elevated: '#ffffff',
  border: '#ded6ca',
  muted: '#6e675e',
  accent: '#246b5f',
  accentForeground: '#ffffff',
  warning: '#9f5a22',
  success: '#2d7a46',
  typeMap: {
    lesson: '#246b5f',
    framework: '#345f9f',
    playbook: '#7b4f9f',
    principle: '#8a5a28',
    topic: '#4f6f52',
  },
};

const navigation = {
  primary: [
    { label: 'Library', routeKey: 'library' },
    { label: 'Pillars', routeKey: 'pillars' },
    { label: 'Sources', routeKey: 'sources' },
    { label: 'Workshop', routeKey: 'workshop' },
  ],
  secondary: [
    { label: 'Segments', routeKey: 'segments' },
    { label: 'Claims', routeKey: 'claims' },
    { label: 'Glossary', routeKey: 'glossary' },
    { label: 'Themes', routeKey: 'themes' },
    { label: 'Search', routeKey: 'search' },
  ],
} satisfies CreatorManualManifest['navigation'];

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function firstString(record: JsonRecord, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function publicText(value: string): string {
  return value
    .replace(uuidLikePattern, 'the source')
    .replace(/\b(?:internal review|manual review|manual-review|tagger|review queue|needs review|audit note|unpublished draft)\b/gi, 'editorial review')
    .trim();
}

function safeText(value: unknown, fallback: string, max = 280): string {
  return publicText(excerpt(nonEmpty(value, fallback), max)) || fallback;
}

function optionalPublicUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  if (/^\/(?!\/)[^\s"'()<>\\]*$/.test(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeBrandColorOverrides(value: unknown): Partial<ColorTokens> {
  const record = asRecord(value);
  const overrides: Partial<ColorTokens> = {};

  for (const field of colorOverrideFields) {
    const candidate = record[field];
    if (typeof candidate === 'string' && candidate.trim()) {
      overrides[field] = candidate.trim();
    }
  }

  const typeMapRecord = asRecord(record.typeMap);
  const typeMap: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(typeMapRecord)) {
    if (typeMapKeyPattern.test(key) && typeof candidate === 'string' && candidate.trim()) {
      typeMap[key] = candidate.trim();
    }
  }
  if (Object.keys(typeMap).length > 0) overrides.typeMap = typeMap;

  return overrides;
}

function uniqueSlug(value: string, used: Set<string>, fallback: string): string {
  const base = slugify(value, fallback);
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = slugify(`${base}-${index}`, fallback);
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function keywords(...values: string[]): string[] {
  const tokens = new Set<string>();
  for (const token of values.join(' ').toLowerCase().match(/[a-z0-9]{3,}/g) ?? []) {
    tokens.add(token);
  }
  return [...tokens].slice(0, 18);
}

function contentToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(contentToText).filter(Boolean).join('\n');
  }
  const record = asRecord(value);
  const parts: string[] = [];
  for (const key of [
    'title',
    'heading',
    'label',
    'body',
    'text',
    'detail',
    'summary',
    'caption',
    'definition',
    'setup',
    'outcome',
  ]) {
    const field = record[key];
    if (typeof field === 'string' && field.trim()) parts.push(field.trim());
  }
  for (const key of ['items', 'steps', 'principles', 'failureModes', 'preconditions']) {
    const field = record[key];
    if (Array.isArray(field)) parts.push(contentToText(field));
  }
  return parts.filter(Boolean).join('\n');
}

function blockTreeBody(blockTreeJson: unknown, fallback: string): string {
  const tree = asRecord(blockTreeJson);
  const blocks = Array.isArray(tree.blocks) ? tree.blocks : [];
  const body = blocks
    .map((block) => {
      const record = asRecord(block);
      return contentToText(record.content);
    })
    .filter((text) => text.trim().length > 0)
    .join('\n\n');
  return safeText(body, fallback, 3_200);
}

function atlasEvidenceIds(blockTreeJson: unknown): string[] {
  const tree = asRecord(blockTreeJson);
  return asStringArray(asRecord(tree.atlasMeta).evidenceSegmentIds);
}

function canonTitle(row: CanonNodeRow): string {
  const payload = asRecord(row.payload);
  return safeText(
    firstString(payload, ['title', 'term', 'name', 'statement'], `${row.type} ${row.id.slice(-4)}`),
    'Manual idea',
    120,
  );
}

function canonSummary(row: CanonNodeRow): string {
  const payload = asRecord(row.payload);
  return safeText(
    firstString(
      payload,
      ['summary', 'idea', 'definition', 'statement', 'whenToUse', 'successSignal'],
      `${canonTitle(row)} is a recurring idea in the source material.`,
    ),
    'A recurring idea from the source material.',
  );
}

function evidenceRefs(segmentIds: string[], segmentsById: Map<string, SegmentRow>): CreatorManualEvidenceRef[] {
  const refs: CreatorManualEvidenceRef[] = [];
  for (const segmentId of new Set(segmentIds)) {
    const row = segmentsById.get(segmentId);
    if (row) {
      refs.push({
        sourceId: row.videoId,
        segmentId: row.id,
        timestampStart: seconds(row.startMs),
        timestampEnd: seconds(row.endMs),
      });
    }
  }
  return refs;
}

function confidence(score: number): CreatorManualClaim['confidence'] {
  if (score >= 75) return 'strong';
  if (score >= 45) return 'moderate';
  return 'developing';
}

function creatorCanonicalUrl(input: {
  youtubeChannelId?: string | null;
  handle?: string | null;
}): string {
  if (input.youtubeChannelId) return `https://www.youtube.com/channel/${input.youtubeChannelId}`;
  if (input.handle) return `https://www.youtube.com/${input.handle.startsWith('@') ? input.handle : `@${input.handle}`}`;
  return 'https://www.youtube.com/';
}

function buildSearch(
  collections: {
    nodes: CreatorManualNode[];
    pillars: CreatorManualPillar[];
    sources: CreatorManualSource[];
    segments: CreatorManualSegment[];
    claims: CreatorManualClaim[];
    glossary: CreatorManualGlossaryEntry[];
    themes: CreatorManualTheme[];
    workshop: CreatorManualWorkshopStage[];
  },
): CreatorManualSearchDoc[] {
  const docs: CreatorManualSearchDoc[] = [];
  for (const node of collections.nodes) {
    docs.push({
      id: `search-node-${node.id}`,
      type: 'node',
      recordId: node.id,
      slug: node.slug,
      title: node.title,
      summary: node.summary,
      body: node.body,
      keywords: keywords(node.title, node.summary, node.body),
    });
  }
  for (const pillar of collections.pillars) {
    docs.push({
      id: `search-pillar-${pillar.id}`,
      type: 'pillar',
      recordId: pillar.id,
      slug: pillar.slug,
      title: pillar.title,
      summary: pillar.summary,
      body: pillar.description,
      keywords: keywords(pillar.title, pillar.summary),
    });
  }
  for (const source of collections.sources) {
    docs.push({
      id: `search-source-${source.id}`,
      type: 'source',
      recordId: source.id,
      title: source.title,
      summary: source.summary,
      keywords: keywords(source.title, source.creatorName, source.summary),
    });
  }
  for (const item of collections.segments) {
    docs.push({
      id: `search-segment-${item.id}`,
      type: 'segment',
      recordId: item.id,
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      body: item.transcriptExcerpt,
      keywords: keywords(item.title, item.summary, item.transcriptExcerpt),
    });
  }
  for (const claim of collections.claims) {
    docs.push({
      id: `search-claim-${claim.id}`,
      type: 'claim',
      recordId: claim.id,
      title: claim.title,
      summary: claim.statement,
      keywords: keywords(claim.title, claim.statement),
    });
  }
  for (const entry of collections.glossary) {
    docs.push({
      id: `search-glossary-${entry.id}`,
      type: 'glossary',
      recordId: entry.id,
      slug: entry.slug,
      title: entry.term,
      summary: entry.definition,
      keywords: keywords(entry.term, entry.definition),
    });
  }
  for (const theme of collections.themes) {
    docs.push({
      id: `search-theme-${theme.id}`,
      type: 'theme',
      recordId: theme.id,
      slug: theme.slug,
      title: theme.title,
      summary: theme.summary,
      keywords: keywords(theme.title, theme.summary),
    });
  }
  for (const stage of collections.workshop) {
    docs.push({
      id: `search-workshop-${stage.id}`,
      type: 'workshop',
      recordId: stage.id,
      slug: stage.slug,
      title: stage.title,
      summary: stage.summary,
      body: stage.objective,
      keywords: keywords(stage.title, stage.summary, stage.objective),
    });
  }
  return docs;
}

export const adaptArchiveToCreatorManual: AdapterFn = async ({ runId, hubId, releaseId }) => {
  const db = getDb();

  const hubRow = (await db.select().from(hub).where(eq(hub.id, hubId)).limit(1))[0];
  if (!hubRow) throw new Error(`Adapter: hub not found (hubId=${hubId})`);

  const releaseRow =
    releaseId === 'unpublished'
      ? undefined
      : (await db.select().from(release).where(eq(release.id, releaseId)).limit(1))[0];
  if (releaseId !== 'unpublished' && !releaseRow) {
    throw new Error(`Adapter: release not found (hubId=${hubId}, releaseId=${releaseId})`);
  }

  const runRow = (await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1))[0];
  if (!runRow) throw new Error(`Adapter: generation run not found (runId=${runId})`);

  const projectRow = (await db.select().from(project).where(eq(project.id, hubRow.projectId)).limit(1))[0];
  if (!projectRow) throw new Error(`Adapter: project not found for hub '${hubId}'`);

  const channelRow = (
    await db.select().from(channel).where(eq(channel.workspaceId, hubRow.workspaceId)).limit(1)
  )[0];
  const profileRow = (
    await db.select().from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1)
  )[0];
  const profile = asRecord(profileRow?.payload);
  const metadata = asRecord(hubRow.metadata);
  const brandOverrides = asRecord(metadata.brand);

  const segmentRows = await db
    .select({
      id: segment.id,
      videoId: segment.videoId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
      summary: segment.summary,
      tags: segment.tags,
    })
    .from(segment)
    .where(eq(segment.runId, runId))
    .orderBy(asc(segment.videoId), asc(segment.startMs));
  const segmentsById = new Map<string, SegmentRow>(segmentRows.map((row) => [row.id, row]));

  const selectedItems = await db
    .select({ videoId: videoSetItem.videoId, position: videoSetItem.position })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, runRow.videoSetId))
    .orderBy(asc(videoSetItem.position));
  const selectedVideoIds = selectedItems.map((item) => item.videoId);
  const fallbackVideoIds = [...new Set(segmentRows.map((row) => row.videoId))];
  const sourceVideoIds = selectedVideoIds.length > 0 ? selectedVideoIds : fallbackVideoIds;
  const videoRowsUnsorted = sourceVideoIds.length
    ? await db.select().from(videoTable).where(inArray(videoTable.id, sourceVideoIds))
    : [];
  const videoById = new Map(videoRowsUnsorted.map((row) => [row.id, row]));
  const videoRows = sourceVideoIds
    .map((id) => videoById.get(id))
    .filter((row): row is VideoRow => row !== undefined);

  const pageRows = await db.select().from(page).where(eq(page.runId, runId)).orderBy(asc(page.position));
  const versionRows = await db
    .select()
    .from(pageVersion)
    .where(eq(pageVersion.runId, runId))
    .orderBy(asc(pageVersion.version));
  const versionsByPageId = new Map<string, typeof versionRows>();
  for (const row of versionRows) {
    const list = versionsByPageId.get(row.pageId) ?? [];
    list.push(row);
    versionsByPageId.set(row.pageId, list);
  }

  const canonRows = await db
    .select()
    .from(canonNode)
    .where(eq(canonNode.runId, runId))
    .orderBy(asc(canonNode.type), asc(canonNode.id));

  const creatorName = safeText(
    firstString(profile, ['creatorName', 'creator', 'channelName', 'name'], channelRow?.title ?? projectRow.title),
    'Creator',
    120,
  );
  const creatorHandle = safeText(
    firstString(profile, ['handle', 'creatorHandle'], channelRow?.handle ?? channelRow?.youtubeChannelId ?? 'creator'),
    'creator',
    80,
  );
  const avatarUrl = optionalPublicUrl(channelRow?.avatarUrl);
  const portraitUrl = optionalPublicUrl(channelRow?.bannerUrl);
  const creator = {
    name: creatorName,
    handle: creatorHandle,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(portraitUrl ? { portraitUrl } : {}),
    canonicalUrl: creatorCanonicalUrl({
      youtubeChannelId: channelRow?.youtubeChannelId,
      handle: channelRow?.handle,
    }),
    tagline: safeText(
      firstString(profile, ['tagline', 'positioning', 'promise'], `${creatorName}'s source-backed operating manual.`),
      `${creatorName}'s source-backed operating manual.`,
    ),
    thesis: safeText(
      firstString(profile, ['thesis', 'coreThesis', 'pointOfView'], `${creatorName}'s work is organized into practical principles, source clips, and reusable operating patterns.`),
      `${creatorName}'s work is organized into practical principles, source clips, and reusable operating patterns.`,
      420,
    ),
    about: safeText(
      firstString(profile, ['about', 'bio', 'description'], channelRow?.description ?? `${creatorName} publishes ideas worth turning into a usable manual.`),
      `${creatorName} publishes ideas worth turning into a usable manual.`,
      520,
    ),
    voiceSummary: safeText(
      firstString(profile, ['voiceSummary', 'voice', 'tone'], 'Clear, practical, and grounded in examples from the source material.'),
      'Clear, practical, and grounded in examples from the source material.',
      320,
    ),
  };

  const usedNodeSlugs = new Set<string>();
  const pageNodes: CreatorManualNode[] = [];
  pageRows.forEach((pageRow, index) => {
    const versions = versionsByPageId.get(pageRow.id) ?? [];
    const version =
      versions.find((candidate) => candidate.id === pageRow.currentVersionId) ??
      versions.find((candidate) => candidate.isCurrent) ??
      versions.at(-1);
    if (!version) return;
    const title = safeText(version.title, pageRow.slug, 140);
    const summary = safeText(version.summary, `${title} distills source material into a usable manual entry.`);
    const evidence = evidenceRefs(atlasEvidenceIds(version.blockTreeJson), segmentsById);
    pageNodes.push({
      id: pageRow.id,
      slug: uniqueSlug(pageRow.slug || title, usedNodeSlugs, `node-${index + 1}`),
      type: slugify(pageRow.pageType, 'node'),
      title,
      summary,
      body: blockTreeBody(version.blockTreeJson, summary),
      pillarIds: [],
      themeIds: [],
      claimIds: [],
      evidence,
    });
  });
  let nodes: CreatorManualNode[] = pageNodes;

  if (nodes.length === 0 && canonRows.length > 0) {
    nodes = canonRows
      .filter((row) => row.type !== 'quote')
      .slice(0, 18)
      .map((row, index) => {
        const title = canonTitle(row);
        const summary = canonSummary(row);
        const payload = asRecord(row.payload);
        return {
          id: row.id,
          slug: uniqueSlug(title, usedNodeSlugs, `node-${index + 1}`),
          type: slugify(row.type, 'node'),
          title,
          summary,
          body: safeText(
            contentToText(payload),
            `${summary}\n\nUse this entry as a practical reference point when applying the manual.`,
            3_200,
          ),
          pillarIds: [],
          themeIds: [],
          claimIds: [],
          evidence: evidenceRefs(row.evidenceSegmentIds, segmentsById),
        };
      });
  }

  if (nodes.length === 0) {
    const firstSourceSummary = segmentRows[0]?.summary ?? segmentRows[0]?.text;
    const summary = safeText(
      firstSourceSummary,
      `${projectRow.title} is organized as a source-backed creator manual.`,
    );
    nodes = [
      {
        id: `overview-${runId}`,
        slug: 'overview',
        type: 'overview',
        title: safeText(projectRow.title, 'Creator Manual', 140),
        summary,
        body: `${summary}\n\nThis overview is generated from the selected source set and can be expanded as more canon nodes and pages are produced.`,
        pillarIds: [],
        themeIds: [],
        claimIds: [],
        evidence: evidenceRefs(segmentRows.slice(0, 3).map((row) => row.id), segmentsById),
      },
    ];
  }

  const sourceSegmentIds = new Map<string, string[]>();
  for (const row of segmentRows) {
    const list = sourceSegmentIds.get(row.videoId) ?? [];
    list.push(row.id);
    sourceSegmentIds.set(row.videoId, list);
  }
  const sources: CreatorManualSource[] = videoRows.map((row) => {
    const url = youtubeUrl(row.youtubeVideoId);
    const thumbnailUrl = optionalPublicUrl(
      sourceThumbnail({ youtubeVideoId: row.youtubeVideoId, thumbnails: row.thumbnails }),
    );
    return {
      id: row.id,
      title: safeText(row.title, 'Untitled source', 160),
      creatorName,
      platform: row.youtubeVideoId ? 'youtube' : 'other',
      youtubeId: row.youtubeVideoId,
      ...(url ? { url } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      durationSec: row.durationSeconds ?? null,
      summary: safeText(row.description, `${row.title ?? 'This source'} contributes evidence to the manual.`),
      segmentIds: sourceSegmentIds.get(row.id) ?? [],
    };
  });

  const nodeIdsBySegment = new Map<string, string[]>();
  for (const node of nodes) {
    for (const ref of node.evidence) {
      if (!ref.segmentId) continue;
      const list = nodeIdsBySegment.get(ref.segmentId) ?? [];
      list.push(node.id);
      nodeIdsBySegment.set(ref.segmentId, list);
    }
  }
  const usedSegmentSlugs = new Set<string>();
  const manifestSegments: CreatorManualSegment[] = segmentRows.map((row, index) => ({
    id: row.id,
    sourceId: row.videoId,
    slug: uniqueSlug(`segment-${index + 1}-${seconds(row.startMs)}`, usedSegmentSlugs, `segment-${index + 1}`),
    title: `Segment ${index + 1}`,
    summary: safeText(row.summary, excerpt(row.text, 160)),
    timestampStart: seconds(row.startMs),
    timestampEnd: seconds(row.endMs),
    transcriptExcerpt: safeText(row.text, 'Transcript excerpt unavailable.', 500),
    nodeIds: nodeIdsBySegment.get(row.id) ?? [],
    claimIds: [],
  }));

  const primaryPillarId = 'pillar-core-manual';
  const primaryThemeId = 'theme-core-ideas';
  for (const node of nodes) {
    node.pillarIds = [primaryPillarId];
    node.themeIds = [primaryThemeId];
  }

  const claims: CreatorManualClaim[] = (
    canonRows.length > 0
      ? canonRows.filter((row) => row.type !== 'topic').slice(0, 8).map((row) => ({
          id: `claim-${row.id}`,
          title: canonTitle(row),
          statement: canonSummary(row),
          confidence: confidence(row.confidenceScore),
          evidence: evidenceRefs(row.evidenceSegmentIds, segmentsById),
          relatedNodeIds: nodes
            .filter((node) => node.evidence.some((ref) => row.evidenceSegmentIds.includes(ref.segmentId ?? '')))
            .map((node) => node.id)
            .slice(0, 6),
        }))
      : nodes.slice(0, 3).map((node) => ({
          id: `claim-${node.id}`,
          title: node.title,
          statement: node.summary,
          confidence: node.evidence.length > 1 ? 'moderate' : 'developing',
          evidence: node.evidence.slice(0, 4),
          relatedNodeIds: [node.id],
        }))
  );
  for (const claim of claims) {
    if (claim.relatedNodeIds.length === 0 && nodes[0]) claim.relatedNodeIds = [nodes[0].id];
    for (const nodeId of claim.relatedNodeIds) {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (node && !node.claimIds.includes(claim.id)) node.claimIds.push(claim.id);
    }
    for (const ref of claim.evidence) {
      if (!ref.segmentId) continue;
      const row = manifestSegments.find((candidate) => candidate.id === ref.segmentId);
      if (row && !row.claimIds.includes(claim.id)) row.claimIds.push(claim.id);
    }
  }

  const pillars: CreatorManualPillar[] = [
    {
      id: primaryPillarId,
      slug: 'core-manual',
      title: 'Core Manual',
      summary: safeText(`${creatorName}'s main operating ideas, organized from the source archive.`, 'Core operating ideas from the source archive.'),
      description: safeText(
        `${creatorName}'s manual brings the strongest pages, clips, and claims into one practical reference system.`,
        'The manual brings the strongest pages, clips, and claims into one practical reference system.',
      ),
      sections: [
        {
          title: 'How to use it',
          body: 'Start with the library entries, inspect the source clips, then use the workshop stages to turn the ideas into practice.',
        },
      ],
      nodeIds: nodes.map((node) => node.id),
      claimIds: claims.map((claim) => claim.id),
      evidence: nodes.flatMap((node) => node.evidence).slice(0, 8),
    },
  ];

  const themes: CreatorManualTheme[] = [
    {
      id: primaryThemeId,
      slug: 'core-ideas',
      title: 'Core Ideas',
      summary: safeText(`The recurring patterns across ${creatorName}'s selected source material.`, 'Recurring patterns across the selected source material.'),
      nodeIds: nodes.map((node) => node.id),
      pillarIds: [primaryPillarId],
      evidence: nodes.flatMap((node) => node.evidence).slice(0, 8),
    },
  ];

  const glossarySourceRows = canonRows.filter((row) => row.type === 'definition').slice(0, 8);
  const glossary: CreatorManualGlossaryEntry[] = (
    glossarySourceRows.length > 0
      ? glossarySourceRows.map((row) => ({
          id: `glossary-${row.id}`,
          term: canonTitle(row),
          slug: slugify(canonTitle(row), 'term'),
          definition: canonSummary(row),
          relatedNodeIds: nodes
            .filter((node) => node.evidence.some((ref) => row.evidenceSegmentIds.includes(ref.segmentId ?? '')))
            .map((node) => node.id)
            .slice(0, 5),
        }))
      : [
          {
            id: 'glossary-source-backed',
            term: 'Source-backed manual',
            slug: 'source-backed-manual',
            definition: 'A practical reference built from selected creator source material and its supporting evidence.',
            relatedNodeIds: nodes.slice(0, 5).map((node) => node.id),
          },
        ]
  );

  const workshop: CreatorManualWorkshopStage[] = [
    {
      id: 'workshop-orient',
      slug: 'orient',
      title: 'Orient',
      summary: 'Choose the most relevant manual entry and inspect its supporting evidence.',
      objective: 'Understand the idea in context before applying it.',
      steps: [
        { title: 'Pick an entry', body: 'Start with the library item that matches the current problem.' },
        { title: 'Review evidence', body: 'Open the related source segments and note the original framing.' },
      ],
      nodeIds: nodes.slice(0, 3).map((node) => node.id),
      evidence: nodes.flatMap((node) => node.evidence).slice(0, 4),
    },
    {
      id: 'workshop-apply',
      slug: 'apply',
      title: 'Apply',
      summary: 'Turn the selected idea into a concrete action, checklist, or decision.',
      objective: 'Move from reference material to a usable next step.',
      steps: [
        { title: 'Translate', body: 'Rewrite the idea as a step you can take this week.' },
        { title: 'Check fit', body: 'Compare the action against the claim evidence and adjust the scope.' },
      ],
      nodeIds: nodes.slice(0, 5).map((node) => node.id),
      evidence: claims.flatMap((claim) => claim.evidence).slice(0, 4),
    },
  ];

  const colorOverrides = sanitizeBrandColorOverrides(brandOverrides.colors);
  const colors: ColorTokens = {
    ...defaultColors,
    ...colorOverrides,
    typeMap: {
      ...defaultColors.typeMap,
      ...(colorOverrides.typeMap ?? {}),
    },
  };
  const typography = {
    headingFamily: nonEmpty(asRecord(brandOverrides.typography).headingFamily, 'Inter, ui-sans-serif, system-ui, sans-serif'),
    bodyFamily: nonEmpty(asRecord(brandOverrides.typography).bodyFamily, 'Inter, ui-sans-serif, system-ui, sans-serif'),
  };
  const assetsOverrides = asRecord(brandOverrides.assets);
  const logoUrl = optionalPublicUrl(assetsOverrides.logoUrl);
  const heroImageUrl = optionalPublicUrl(assetsOverrides.heroImageUrl);
  const patternImageUrl = optionalPublicUrl(assetsOverrides.patternImageUrl);
  const assets = {
    ...(logoUrl ? { logoUrl } : {}),
    ...(heroImageUrl ? { heroImageUrl } : {}),
    ...(patternImageUrl ? { patternImageUrl } : {}),
  };

  const search = buildSearch({
    nodes,
    pillars,
    sources,
    segments: manifestSegments,
    claims,
    glossary,
    themes,
    workshop,
  });

  const manifest: CreatorManualManifest = {
    schemaVersion: 'creator_manual_v1',
    template: { id: 'creator-manual', version: 1 },
    hubId,
    releaseId,
    hubSlug: slugify(String(hubRow.subdomain), 'hub'),
    visibility: hubRow.accessMode === 'public' ? 'public' : 'unlisted',
    publishedAt: releaseRow?.liveAt?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    title: safeText(projectRow.title, 'Creator Manual', 160),
    tagline: safeText(metadata.tagline, `${creatorName}'s source-backed operating manual.`),
    creator,
    brand: {
      name: safeText(brandOverrides.name, `${creatorName} Manual`, 120),
      tone: safeText(brandOverrides.tone, 'Professional, practical, and evidence-led.', 180),
      tokens: {
        colors,
        typography,
        radius: '8px',
        shadow: '0 18px 60px rgba(25, 23, 22, 0.12)',
      },
      ...(Object.keys(assets).length > 0 ? { assets } : {}),
      style: { mode: 'custom' },
      labels: {
        evidence: 'Evidence',
        workshop: 'Workshop',
        library: 'Library',
      },
    },
    navigation,
    home: {
      eyebrow: 'Creator Manual',
      headline: safeText(projectRow.title, `${creatorName} Manual`, 160),
      summary: safeText(
        metadata.tagline,
        `${creatorName}'s selected source material organized into nodes, claims, clips, and practical workshop stages.`,
        360,
      ),
      featuredNodeIds: nodes.slice(0, 4).map((node) => node.id),
      featuredPillarIds: pillars.slice(0, 3).map((pillar) => pillar.id),
    },
    stats: {
      nodeCount: nodes.length,
      pillarCount: pillars.length,
      sourceCount: sources.length,
      segmentCount: manifestSegments.length,
      claimCount: claims.length,
      glossaryCount: glossary.length,
    },
    nodes,
    pillars,
    sources,
    segments: manifestSegments,
    claims,
    glossary,
    themes,
    workshop,
    search,
  };

  return manifest;
};
