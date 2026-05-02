import { and, eq, getDb } from '@creatorcanon/db';
import { archiveAudit, auditHubGeneration, generationRun, hub } from '@creatorcanon/db/schema';
import type { PipelineStage } from '@creatorcanon/core/pipeline-stages';

import { auditReportSchema, type AuditReport } from '../audit';
import { runStage } from '../harness';
import {
  publishRunAsHub as defaultPublishRunAsHub,
  type PublishRunAsHubInput,
  type PublishRunAsHubResult,
} from '../publish-run-as-hub';
import type { RunGenerationPipelinePayload } from '../run-generation-pipeline';
import {
  generateCreatorManualDesignSpecWithProvenance as defaultGenerateCreatorManualDesignSpecWithProvenance,
  type CreatorManualDesignSpecGeneration,
  type GenerateCreatorManualDesignSpecInput,
} from './design-spec';
import {
  queueAuditHubGenerationRun as defaultQueueAuditHubGenerationRun,
  seedAuditHubGeneration as defaultSeedAuditHubGeneration,
  type SeedAuditHubGenerationInput,
  type SeedAuditHubGenerationResult,
} from './seed';
import type { CreatorManualDesignSpec } from './types';

type AuditStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AuditHubGenerationResult {
  auditId: string;
  projectId: string;
  runId: string;
  hubId: string;
  releaseId?: string | null;
  publicPath?: string | null;
  status: string;
}

export interface AuditHubGenerationSummary extends AuditHubGenerationResult {
  projectPath: string;
}

export interface StartAuditHubGenerationInput {
  auditId: string;
  workspaceId: string;
  actorUserId: string;
  autoPublish?: boolean;
}

export interface StartAuditHubGenerationResult extends SeedAuditHubGenerationResult {
  auditId: string;
  designSpec: CreatorManualDesignSpec;
  queuedForDispatch: boolean;
  summary: AuditHubGenerationSummary;
}

export interface AuditHubCompletionResult {
  auditHubGenerationId: string;
  auditId: string;
  projectId: string;
  runId: string;
  hubId: string;
  releaseId: string;
  publicPath: string;
  status: 'published';
}

export interface StartAuditHubGenerationStore {
  findArchiveAuditById(auditId: string): Promise<{
    id: string;
    status: AuditStatus | string;
    report: unknown;
  } | null>;
}

export interface AuditHubCompletionLink {
  id: string;
  auditId: string;
  workspaceId: string;
  projectId: string;
  runId: string;
  hubId: string;
  releaseId: string | null;
  actorUserId: string | null;
  autoPublish: boolean;
  status: string;
  publicPath?: string | null;
  runStatus: string;
}

export interface CompleteAuditGeneratedRunStore {
  findAuditHubGenerationByRunId(runId: string): Promise<AuditHubCompletionLink | null>;
  markAuditHubGenerationPublished(input: {
    id: string;
    releaseId: string;
    publicPath: string;
  }): Promise<void>;
  markAuditHubGenerationFailed(input: { id: string; error: unknown }): Promise<void>;
}

export interface AuditHandoffArtifactWriterInput {
  runId: string;
  workspaceId: string;
  pipelineVersion: string;
  stage: AuditHandoffArtifactStage;
  output: unknown;
}

type AuditHandoffArtifactStage = 'audit_handoff_context' | 'audit_design_spec';

export interface StartAuditHubGenerationDeps {
  store?: StartAuditHubGenerationStore;
  generateDesignSpec?: (
    input: GenerateCreatorManualDesignSpecInput,
  ) => Promise<CreatorManualDesignSpec>;
  generateDesignSpecWithProvenance?: (
    input: GenerateCreatorManualDesignSpecInput,
  ) => Promise<CreatorManualDesignSpecGeneration>;
  seedAuditHubGeneration?: (
    input: SeedAuditHubGenerationInput,
  ) => Promise<SeedAuditHubGenerationResult>;
  writeArtifact?: (input: AuditHandoffArtifactWriterInput) => Promise<unknown>;
  queueAuditHubGenerationRun?: (input: { runId: string }) => Promise<boolean>;
}

export interface CompleteAuditGeneratedRunDeps {
  store?: CompleteAuditGeneratedRunStore;
  publishRunAsHub?: (input: PublishRunAsHubInput) => Promise<PublishRunAsHubResult>;
}

export function summarizeAuditHubGenerationResult(
  result: AuditHubGenerationResult,
): AuditHubGenerationSummary {
  return {
    ...result,
    projectPath: `/app/projects/${result.projectId}`,
    publicPath: result.publicPath ?? null,
  };
}

export async function startAuditHubGeneration(
  input: StartAuditHubGenerationInput,
  deps: StartAuditHubGenerationDeps = {},
): Promise<StartAuditHubGenerationResult> {
  const store = deps.store ?? createDrizzleStartAuditHubGenerationStore();
  const auditRow = await store.findArchiveAuditById(input.auditId);
  if (!auditRow) throw new Error(`Archive audit ${input.auditId} was not found.`);
  if (auditRow.status !== 'succeeded') {
    throw new Error(`Archive audit ${input.auditId} must have succeeded before hub generation.`);
  }

  const auditReport = auditReportSchema.parse(auditRow.report);
  const designSpecGeneration = await generateDesignSpecForAudit(auditReport, deps);
  const designSpec = designSpecGeneration.spec;

  const seed = await (deps.seedAuditHubGeneration ?? defaultSeedAuditHubGeneration)({
    auditId: input.auditId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    auditReport,
    designSpec,
    autoPublish: input.autoPublish ?? true,
    queueRun: false,
  });

  const writeArtifact = deps.writeArtifact ?? writeAuditHandoffArtifact;
  await writeArtifact({
    runId: seed.runId,
    workspaceId: input.workspaceId,
    pipelineVersion: seed.payload.pipelineVersion,
    stage: 'audit_handoff_context',
    output: buildAuditHandoffContext(input, auditReport, seed.payload),
  });
  await writeArtifact({
    runId: seed.runId,
    workspaceId: input.workspaceId,
    pipelineVersion: seed.payload.pipelineVersion,
    stage: 'audit_design_spec',
    output: buildAuditDesignSpecArtifact(designSpecGeneration),
  });
  let runStatus = seed.runStatus;
  let queuedForDispatch = false;
  if (seed.runStatus === 'draft') {
    const queued = await (deps.queueAuditHubGenerationRun ?? defaultQueueAuditHubGenerationRun)({
      runId: seed.runId,
    });
    runStatus = queued ? 'queued' : seed.runStatus;
    queuedForDispatch = queued;
  }

  return {
    ...seed,
    runStatus,
    auditId: input.auditId,
    designSpec,
    queuedForDispatch,
    summary: summarizeAuditHubGenerationResult({
      auditId: input.auditId,
      projectId: seed.projectId,
      runId: seed.runId,
      hubId: seed.hubId,
      status: 'queued',
    }),
  };
}

export async function completeAuditGeneratedRun(
  input: { runId: string },
  deps: CompleteAuditGeneratedRunDeps = {},
): Promise<AuditHubCompletionResult | null> {
  const store = deps.store ?? createDrizzleCompleteAuditGeneratedRunStore();
  const link = await store.findAuditHubGenerationByRunId(input.runId);
  if (!link || !link.autoPublish) return null;

  if (link.status === 'published' && link.releaseId) {
    return {
      auditHubGenerationId: link.id,
      auditId: link.auditId,
      projectId: link.projectId,
      runId: link.runId,
      hubId: link.hubId,
      releaseId: link.releaseId,
      publicPath: link.publicPath ?? '',
      status: 'published',
    };
  }

  try {
    if (link.runStatus !== 'awaiting_review' && link.runStatus !== 'published') {
      throw new Error(`Cannot auto-publish audit handoff run with status ${link.runStatus}.`);
    }
    if (!link.actorUserId) {
      throw new Error('Cannot auto-publish audit handoff run without an actor user.');
    }

    const published = await (deps.publishRunAsHub ?? defaultPublishRunAsHub)({
      workspaceId: link.workspaceId,
      projectId: link.projectId,
      runId: link.runId,
      actorUserId: link.actorUserId,
    });
    await store.markAuditHubGenerationPublished({
      id: link.id,
      releaseId: published.releaseId,
      publicPath: published.publicPath,
    });

    return {
      auditHubGenerationId: link.id,
      auditId: link.auditId,
      projectId: link.projectId,
      runId: link.runId,
      hubId: published.hubId,
      releaseId: published.releaseId,
      publicPath: published.publicPath,
      status: 'published',
    };
  } catch (error) {
    await store.markAuditHubGenerationFailed({ id: link.id, error });
    throw error;
  }
}

export async function markAuditGeneratedRunFailed(
  input: { runId: string; error: unknown },
  deps: Pick<CompleteAuditGeneratedRunDeps, 'store'> = {},
): Promise<boolean> {
  const store = deps.store ?? createDrizzleCompleteAuditGeneratedRunStore();
  const link = await store.findAuditHubGenerationByRunId(input.runId);
  if (!link || link.status === 'published') return false;

  await store.markAuditHubGenerationFailed({ id: link.id, error: input.error });
  return true;
}

async function generateDesignSpecForAudit(
  auditReport: AuditReport,
  deps: StartAuditHubGenerationDeps,
): Promise<CreatorManualDesignSpecGeneration> {
  if (deps.generateDesignSpecWithProvenance) {
    return deps.generateDesignSpecWithProvenance({ auditReport });
  }
  if (deps.generateDesignSpec) {
    return {
      spec: await deps.generateDesignSpec({ auditReport }),
      source: 'model',
    };
  }
  return defaultGenerateCreatorManualDesignSpecWithProvenance({ auditReport });
}

function buildAuditHandoffContext(
  input: StartAuditHubGenerationInput,
  auditReport: AuditReport,
  payload: RunGenerationPipelinePayload,
) {
  return {
    auditId: input.auditId,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    autoPublish: input.autoPublish ?? true,
    channel: auditReport.channel,
    scores: auditReport.scores,
    payload,
  };
}

function buildAuditDesignSpecArtifact(generation: CreatorManualDesignSpecGeneration) {
  return {
    spec: generation.spec,
    source: generation.source,
    fallbackReason: generation.fallbackReason ?? null,
  };
}

async function writeAuditHandoffArtifact(input: AuditHandoffArtifactWriterInput): Promise<unknown> {
  return runStage({
    ctx: {
      runId: input.runId,
      workspaceId: input.workspaceId,
      pipelineVersion: input.pipelineVersion,
    },
    stage: input.stage as PipelineStage,
    input: input.output,
    run: async (output) => output,
  });
}

function createDrizzleStartAuditHubGenerationStore(db = getDb()): StartAuditHubGenerationStore {
  return {
    async findArchiveAuditById(auditId) {
      const rows = await db
        .select({
          id: archiveAudit.id,
          status: archiveAudit.status,
          report: archiveAudit.report,
        })
        .from(archiveAudit)
        .where(eq(archiveAudit.id, auditId))
        .limit(1);
      return rows[0] ?? null;
    },
  };
}

function createDrizzleCompleteAuditGeneratedRunStore(db = getDb()): CompleteAuditGeneratedRunStore {
  return {
    async findAuditHubGenerationByRunId(runId) {
      const rows = await db
        .select({
          id: auditHubGeneration.id,
          auditId: auditHubGeneration.auditId,
          workspaceId: auditHubGeneration.workspaceId,
          projectId: auditHubGeneration.projectId,
          runId: auditHubGeneration.runId,
          hubId: auditHubGeneration.hubId,
          releaseId: auditHubGeneration.releaseId,
          actorUserId: auditHubGeneration.actorUserId,
          autoPublish: auditHubGeneration.autoPublish,
          status: auditHubGeneration.status,
          subdomain: hub.subdomain,
          runStatus: generationRun.status,
        })
        .from(auditHubGeneration)
        .innerJoin(generationRun, eq(generationRun.id, auditHubGeneration.runId))
        .innerJoin(hub, eq(hub.id, auditHubGeneration.hubId))
        .where(eq(auditHubGeneration.runId, runId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        publicPath: row.subdomain ? `/h/${row.subdomain}` : null,
      };
    },
    async markAuditHubGenerationPublished(input) {
      await db
        .update(auditHubGeneration)
        .set({
          status: 'published',
          releaseId: input.releaseId,
          errorJson: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(auditHubGeneration.id, input.id));
    },
    async markAuditHubGenerationFailed(input) {
      await db
        .update(auditHubGeneration)
        .set({
          status: 'failed',
          errorJson: serializeError(input.error),
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(auditHubGeneration.id, input.id)));
    },
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      type: error.constructor.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}
