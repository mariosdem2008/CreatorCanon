import { createHash, randomUUID } from 'node:crypto';

import { and, eq, getDb } from '@creatorcanon/db';
import {
  auditHubGeneration,
  channel,
  generationRun,
  hub,
  project,
  video,
  videoSet,
  videoSetItem,
} from '@creatorcanon/db/schema';
import { FLAT_PRICE_CENTS, PIPELINE_VERSION } from '@creatorcanon/core';

import type { AuditReport } from '../audit';
import type { RunGenerationPipelinePayload } from '../run-generation-pipeline';
import { getOrCreateHub as defaultGetOrCreateHub, normalizeHubTheme } from '../publish-run-as-hub';
import {
  normalizeDesignSpecForHubMetadata,
  type CreatorManualDesignSpec,
  type CreatorManualHubMetadata,
} from './types';

export interface BuildAuditVideoSeedSetInput {
  sampleLessonVideoIds: readonly string[];
  examplePageVideoIds: readonly string[];
  maxVideos: number;
}

export interface BuildAuditProjectConfigInput {
  auditId: string;
  designSpecId: string;
  audience: string;
  tone: string;
}

export interface AuditProjectConfig {
  audience: string;
  tone: string;
  length_preset: 'standard';
  chat_enabled: true;
  presentation_preset: 'paper';
  audit_handoff: {
    auditId: string;
    designSpecId: string;
  };
  [key: string]: unknown;
}

export interface AuditHubGenerationStore {
  findAuditHubGeneration(input: {
    auditId: string;
    workspaceId: string;
  }): Promise<{
    id: string;
    projectId: string;
    runId: string;
    videoSetId: string;
    hubId: string;
    pipelineVersion: string;
    runStatus: string;
  } | null>;
  withTransaction?<T>(fn: (store: AuditHubGenerationStore) => Promise<T>): Promise<T>;
  findChannelByYoutubeId(input: {
    workspaceId: string;
    youtubeChannelId: string;
  }): Promise<{ id: string } | null>;
  createChannel(input: {
    id: string;
    workspaceId: string;
    youtubeChannelId: string;
    title: string;
    handle: string | null;
    avatarUrl: string | null;
  }): Promise<{ id: string }>;
  findVideoByYoutubeId(workspaceId: string, youtubeVideoId: string): Promise<{ id: string } | null>;
  createVideo(input: {
    id: string;
    workspaceId: string;
    channelId: string;
    youtubeVideoId: string;
    title: string;
  }): Promise<{ id: string }>;
  createVideoSet(input: {
    id: string;
    workspaceId: string;
    name: string;
    createdBy: string;
    status: 'locked';
  }): Promise<{ id: string }>;
  createVideoSetItems(
    items: {
      id: string;
      videoSetId: string;
      videoId: string;
      position: number;
    }[],
  ): Promise<void>;
  createProject(input: {
    id: string;
    workspaceId: string;
    videoSetId: string;
    title: string;
    config: AuditProjectConfig;
  }): Promise<{ id: string }>;
  createGenerationRun(input: {
    id: string;
    workspaceId: string;
    projectId: string;
    videoSetId: string;
    pipelineVersion: string;
    configHash: string;
    status: 'draft';
    priceCents: number;
  }): Promise<{ id: string; pipelineVersion: string }>;
  queueGenerationRun(input: {
    runId: string;
  }): Promise<boolean>;
  updateProjectCurrentRun(input: {
    projectId: string;
    runId: string;
  }): Promise<void>;
  updateHubMetadata(input: {
    hubId: string;
    metadata: CreatorManualHubMetadata;
  }): Promise<void>;
  getOrCreateHub?(input: {
    workspaceId: string;
    projectId: string;
    title: string;
    theme: ReturnType<typeof normalizeHubTheme>;
  }): Promise<{ id: string }>;
  createAuditHubGeneration(input: {
    id: string;
    auditId: string;
    workspaceId: string;
    projectId: string;
    runId: string;
    hubId: string;
    actorUserId: string;
    autoPublish: boolean;
    designSpec: CreatorManualDesignSpec;
  }): Promise<{ id: string }>;
}

export interface SeedAuditHubGenerationInput {
  auditId: string;
  workspaceId: string;
  actorUserId: string;
  auditReport: AuditReport;
  designSpec: CreatorManualDesignSpec;
  autoPublish?: boolean;
  queueRun?: boolean;
  designSpecId?: string;
  maxVideos?: number;
  store?: AuditHubGenerationStore;
  getOrCreateHub?: AuditHubCreator;
}

export interface SeedAuditHubGenerationResult {
  projectId: string;
  runId: string;
  runStatus: string;
  videoSetId: string;
  hubId: string;
  auditHubGenerationId: string;
  payload: RunGenerationPipelinePayload;
}

export type AuditHubCreator = (input: {
  workspaceId: string;
  projectId: string;
  title: string;
  theme: ReturnType<typeof normalizeHubTheme>;
}) => Promise<{ id: string }>;

export async function queueAuditHubGenerationRun(input: {
  runId: string;
  store?: Pick<AuditHubGenerationStore, 'queueGenerationRun'>;
}): Promise<boolean> {
  const store = input.store ?? createDrizzleAuditHubGenerationStore();
  return store.queueGenerationRun({ runId: input.runId });
}

export function buildAuditVideoSeedSet(input: BuildAuditVideoSeedSetInput): string[] {
  const maxVideos = Math.max(0, input.maxVideos);
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const rawId of [...input.sampleLessonVideoIds, ...input.examplePageVideoIds]) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    selected.push(id);
    seen.add(id);
    if (selected.length >= maxVideos) break;
  }

  return selected;
}

export function buildAuditProjectConfig(input: BuildAuditProjectConfigInput): AuditProjectConfig {
  return {
    audience: input.audience,
    tone: input.tone,
    length_preset: 'standard',
    chat_enabled: true,
    presentation_preset: 'paper',
    audit_handoff: {
      auditId: input.auditId,
      designSpecId: input.designSpecId,
    },
  };
}

export function buildAuditChannelYoutubeId(workspaceId: string, youtubeChannelId: string): string {
  return `audit:${workspaceId}:${youtubeChannelId}`;
}

export async function seedAuditHubGeneration(
  input: SeedAuditHubGenerationInput,
): Promise<SeedAuditHubGenerationResult> {
  const store = input.store ?? createDrizzleAuditHubGenerationStore();
  const existing = await store.findAuditHubGeneration({
    auditId: input.auditId,
    workspaceId: input.workspaceId,
  });

  if (existing) {
    return buildExistingAuditHubGenerationResult(store, input, existing);
  }

  try {
    if (store.withTransaction) {
      return await store.withTransaction((transactionStore) =>
        seedNewAuditHubGeneration(input, transactionStore),
      );
    }

    return await seedNewAuditHubGeneration(input, store);
  } catch (error) {
    if (!isUniqueConflictError(error)) throw error;

    const recovered = await store.findAuditHubGeneration({
      auditId: input.auditId,
      workspaceId: input.workspaceId,
    });
    if (!recovered) throw error;

    return buildExistingAuditHubGenerationResult(store, input, recovered);
  }
}

async function seedNewAuditHubGeneration(
  input: SeedAuditHubGenerationInput,
  store: AuditHubGenerationStore,
): Promise<SeedAuditHubGenerationResult> {
  const designMetadata = normalizeDesignSpecForHubMetadata(input.designSpec);
  const designSpecId = input.designSpecId ?? `audit-design-${input.auditId}`;
  const title = getAuditHubTitle(input.auditReport);
  const projectConfig = buildAuditProjectConfig({
    auditId: input.auditId,
    designSpecId,
    audience: input.auditReport.auditMemo.recommendedHub.targetAudience,
    tone: input.designSpec.brand.tone,
  });
  const nowIds = createSeedIds();

  const sourceVideoIds = buildAuditVideoSeedSet({
    sampleLessonVideoIds: input.auditReport.blueprint.sampleLesson.sourceVideoIds,
    examplePageVideoIds: input.auditReport.auditMemo.examplePage.sourceVideosUsed.map(
      (source) => source.videoId,
    ),
    maxVideos: input.maxVideos ?? 12,
  });

  const channelRow =
    (await store.findChannelByYoutubeId({
      workspaceId: input.workspaceId,
      youtubeChannelId: buildAuditChannelYoutubeId(input.workspaceId, input.auditReport.channel.id),
    })) ??
    (await store.createChannel({
      id: nowIds.channelId,
      workspaceId: input.workspaceId,
      youtubeChannelId: buildAuditChannelYoutubeId(input.workspaceId, input.auditReport.channel.id),
      title: input.auditReport.channel.title,
      handle: input.auditReport.channel.handle,
      avatarUrl: input.auditReport.channel.thumbnailUrl,
    }));

  const titleByVideoId = new Map(
    input.auditReport.auditMemo.examplePage.sourceVideosUsed.map((source) => [
      source.videoId,
      source.title,
    ]),
  );
  const videoRows: { id: string }[] = [];

  for (const youtubeVideoId of sourceVideoIds) {
    const existingVideo = await store.findVideoByYoutubeId(input.workspaceId, youtubeVideoId);
    if (existingVideo) {
      videoRows.push(existingVideo);
      continue;
    }

    videoRows.push(
      await store.createVideo({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        channelId: channelRow.id,
        youtubeVideoId,
        title: titleByVideoId.get(youtubeVideoId) ?? `Source video ${youtubeVideoId}`,
      }),
    );
  }

  const videoSetRow = await store.createVideoSet({
    id: nowIds.videoSetId,
    workspaceId: input.workspaceId,
    name: `${title} sources`,
    createdBy: input.actorUserId,
    status: 'locked',
  });
  await store.createVideoSetItems(
    videoRows.map((row, index) => ({
      id: randomUUID(),
      videoSetId: videoSetRow.id,
      videoId: row.id,
      position: index,
    })),
  );

  const projectRow = await store.createProject({
    id: nowIds.projectId,
    workspaceId: input.workspaceId,
    videoSetId: videoSetRow.id,
    title,
    config: projectConfig,
  });
  const runRow = await store.createGenerationRun({
    id: nowIds.runId,
    workspaceId: input.workspaceId,
    projectId: projectRow.id,
    videoSetId: videoSetRow.id,
    pipelineVersion: PIPELINE_VERSION,
    configHash: hashConfig({
      auditId: input.auditId,
      workspaceId: input.workspaceId,
      sourceVideoIds,
      projectConfig,
      designSpec: input.designSpec,
    }),
    status: 'draft',
    priceCents: FLAT_PRICE_CENTS,
  });
  await store.updateProjectCurrentRun({ projectId: projectRow.id, runId: runRow.id });

  const hubRow = await (input.getOrCreateHub ?? store.getOrCreateHub ?? defaultGetOrCreateHub)({
    workspaceId: input.workspaceId,
    projectId: projectRow.id,
    title,
    theme: normalizeHubTheme(projectConfig.presentation_preset),
  });
  await store.updateHubMetadata({ hubId: hubRow.id, metadata: designMetadata });

  const linkRow = await store.createAuditHubGeneration({
    id: nowIds.auditHubGenerationId,
    auditId: input.auditId,
    workspaceId: input.workspaceId,
    projectId: projectRow.id,
    runId: runRow.id,
    hubId: hubRow.id,
    actorUserId: input.actorUserId,
    autoPublish: input.autoPublish ?? true,
    designSpec: input.designSpec,
  });
  let runStatus = 'draft';
  if (input.queueRun ?? true) {
    const queued = await store.queueGenerationRun({ runId: runRow.id });
    runStatus = queued ? 'queued' : 'draft';
  }

  return {
    projectId: projectRow.id,
    runId: runRow.id,
    runStatus,
    videoSetId: videoSetRow.id,
    hubId: hubRow.id,
    auditHubGenerationId: linkRow.id,
    payload: buildPipelinePayload({
      runId: runRow.id,
      projectId: projectRow.id,
      workspaceId: input.workspaceId,
      videoSetId: videoSetRow.id,
      pipelineVersion: runRow.pipelineVersion,
    }),
  };
}

async function buildExistingAuditHubGenerationResult(
  store: AuditHubGenerationStore,
  input: SeedAuditHubGenerationInput,
  existing: NonNullable<Awaited<ReturnType<AuditHubGenerationStore['findAuditHubGeneration']>>>,
): Promise<SeedAuditHubGenerationResult> {
  let runStatus = existing.runStatus;
  if (existing.runStatus === 'draft' && (input.queueRun ?? true)) {
    const queued = await store.queueGenerationRun({ runId: existing.runId });
    runStatus = queued ? 'queued' : existing.runStatus;
  }

  return {
    projectId: existing.projectId,
    runId: existing.runId,
    runStatus,
    videoSetId: existing.videoSetId,
    hubId: existing.hubId,
    auditHubGenerationId: existing.id,
    payload: buildPipelinePayload({
      runId: existing.runId,
      projectId: existing.projectId,
      workspaceId: input.workspaceId,
      videoSetId: existing.videoSetId,
      pipelineVersion: existing.pipelineVersion,
    }),
  };
}

function createSeedIds() {
  return {
    channelId: randomUUID(),
    videoSetId: randomUUID(),
    projectId: randomUUID(),
    runId: randomUUID(),
    auditHubGenerationId: randomUUID(),
  };
}

function getAuditHubTitle(auditReport: AuditReport): string {
  return (
    auditReport.auditMemo.recommendedHub.name ||
    auditReport.auditMemo.bestFirstHub ||
    auditReport.blueprint.hubTitle
  );
}

function buildPipelinePayload(input: RunGenerationPipelinePayload): RunGenerationPipelinePayload {
  return input;
}

function hashConfig(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32);
}

function isUniqueConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: string }).code;
  return code === '23505' || /duplicate key value|unique constraint/i.test(error.message);
}

function slugifyHubSubdomain(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 30) || 'hub'
  );
}

export function buildHubSubdomainCandidates(title: string, projectId: string): string[] {
  const base = slugifyHubSubdomain(title);
  const candidates: string[] = [base];

  for (let index = 2; index <= 20; index += 1) {
    const suffix = `-${index}`;
    candidates.push(`${base.slice(0, 30 - suffix.length)}${suffix}`);
  }

  const projectSuffix = `-${projectId.slice(0, 8)}`;
  candidates.push(`${base.slice(0, 30 - projectSuffix.length)}${projectSuffix}`);

  return [...new Set(candidates)];
}

function createDrizzleAuditHubGenerationStore(db = getDb()): AuditHubGenerationStore {
  return {
    async withTransaction(fn) {
      return db.transaction(async (tx) =>
        fn(createDrizzleAuditHubGenerationStore(tx as typeof db)),
      );
    },
    async findAuditHubGeneration(input) {
      const rows = await db
        .select({
          id: auditHubGeneration.id,
          projectId: auditHubGeneration.projectId,
          runId: auditHubGeneration.runId,
          videoSetId: generationRun.videoSetId,
          hubId: auditHubGeneration.hubId,
          pipelineVersion: generationRun.pipelineVersion,
          runStatus: generationRun.status,
        })
        .from(auditHubGeneration)
        .innerJoin(generationRun, eq(generationRun.id, auditHubGeneration.runId))
        .where(
          and(
            eq(auditHubGeneration.auditId, input.auditId),
            eq(auditHubGeneration.workspaceId, input.workspaceId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
    async findChannelByYoutubeId(input) {
      const rows = await db
        .select({ id: channel.id })
        .from(channel)
        .where(
          and(
            eq(channel.workspaceId, input.workspaceId),
            eq(channel.youtubeChannelId, input.youtubeChannelId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },
    async createChannel(input) {
      const rows = await db
        .insert(channel)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          youtubeChannelId: input.youtubeChannelId,
          title: input.title,
          handle: input.handle,
          avatarUrl: input.avatarUrl,
          sourceKind: 'youtube',
          metadataFetchedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: channel.id });
      if (rows[0]) return rows[0];

      const existing = await this.findChannelByYoutubeId({
        workspaceId: input.workspaceId,
        youtubeChannelId: input.youtubeChannelId,
      });
      if (!existing) throw new Error('Channel insert conflicted but no existing row was found.');
      return existing;
    },
    async findVideoByYoutubeId(workspaceId, youtubeVideoId) {
      const rows = await db
        .select({ id: video.id })
        .from(video)
        .where(and(eq(video.workspaceId, workspaceId), eq(video.youtubeVideoId, youtubeVideoId)))
        .limit(1);
      return rows[0] ?? null;
    },
    async createVideo(input) {
      const rows = await db
        .insert(video)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          youtubeVideoId: input.youtubeVideoId,
          title: input.title,
          sourceKind: 'youtube',
          metadataFetchedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: video.id });
      if (rows[0]) return rows[0];

      const existing = await this.findVideoByYoutubeId(input.workspaceId, input.youtubeVideoId);
      if (!existing) throw new Error('Video insert conflicted but no existing row was found.');
      return existing;
    },
    async createVideoSet(input) {
      const rows = await db
        .insert(videoSet)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          name: input.name,
          createdBy: input.createdBy,
          status: input.status,
        })
        .returning({ id: videoSet.id });
      return rows[0]!;
    },
    async createVideoSetItems(items) {
      if (items.length === 0) return;
      await db.insert(videoSetItem).values(items);
    },
    async createProject(input) {
      const rows = await db
        .insert(project)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          videoSetId: input.videoSetId,
          title: input.title,
          config: input.config,
        })
        .returning({ id: project.id });
      return rows[0]!;
    },
    async createGenerationRun(input) {
      const rows = await db
        .insert(generationRun)
        .values({
          id: input.id,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          videoSetId: input.videoSetId,
          pipelineVersion: input.pipelineVersion,
          configHash: input.configHash,
          status: input.status,
          priceCents: input.priceCents,
        })
        .returning({ id: generationRun.id, pipelineVersion: generationRun.pipelineVersion });
      return rows[0]!;
    },
    async queueGenerationRun(input) {
      const rows = await db
        .update(generationRun)
        .set({ status: 'queued', updatedAt: new Date() })
        .where(and(eq(generationRun.id, input.runId), eq(generationRun.status, 'draft')))
        .returning({ id: generationRun.id });
      return rows.length > 0;
    },
    async updateProjectCurrentRun(input) {
      await db
        .update(project)
        .set({ currentRunId: input.runId, updatedAt: new Date() })
        .where(eq(project.id, input.projectId));
    },
    async updateHubMetadata(input) {
      await db
        .update(hub)
        .set({
          metadata: input.metadata,
          templateKey: 'creator_manual',
          freePreview: 'all',
          updatedAt: new Date(),
        })
        .where(eq(hub.id, input.hubId));
    },
    async getOrCreateHub(input) {
      const existing = await db
        .select()
        .from(hub)
        .where(and(eq(hub.projectId, input.projectId), eq(hub.workspaceId, input.workspaceId)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(hub)
          .set({
            theme: input.theme,
            templateKey: 'creator_manual',
            freePreview: 'all',
            updatedAt: new Date(),
          })
          .where(eq(hub.id, existing[0].id));
        return { id: existing[0].id };
      }

      const now = new Date();

      for (const subdomain of buildHubSubdomainCandidates(input.title, input.projectId)) {
        const rows = await db
          .insert(hub)
          .values({
            id: randomUUID(),
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            subdomain,
            theme: input.theme,
            templateKey: 'creator_manual',
            accessMode: 'public',
            freePreview: 'all',
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ id: hub.id });
        if (rows[0]) return rows[0];

        const recovered = await db
          .select({ id: hub.id })
          .from(hub)
          .where(and(eq(hub.projectId, input.projectId), eq(hub.workspaceId, input.workspaceId)))
          .limit(1);
        if (recovered[0]) return recovered[0];
      }

      throw new Error('Hub insert conflicted for every candidate subdomain.');
    },
    async createAuditHubGeneration(input) {
      const rows = await db
        .insert(auditHubGeneration)
        .values({
          id: input.id,
          auditId: input.auditId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          runId: input.runId,
          hubId: input.hubId,
          actorUserId: input.actorUserId,
          autoPublish: input.autoPublish,
          designSpec: input.designSpec,
          status: 'queued',
        })
        .returning({ id: auditHubGeneration.id });
      return rows[0]!;
    },
  };
}
