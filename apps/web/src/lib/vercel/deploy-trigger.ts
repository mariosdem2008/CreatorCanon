import { and, eq, type AtlasDb } from '@creatorcanon/db';
import {
  deployment,
  hub,
  type DeploymentStatus,
} from '@creatorcanon/db/schema';

import type {
  VercelClient,
  VercelCreateDeploymentRequest,
  VercelDeployment,
} from './client';
import { normalizeVercelProjectName } from './project-create';

export interface DeploymentTriggerRecord {
  hubId: string;
  hubSlug: string;
  vercelProjectId: string | null;
  vercelDeploymentId: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  sslReady: boolean;
  liveUrl: string | null;
  status: DeploymentStatus;
  lastError: string | null;
}

export interface DeploymentTriggerRepository {
  findDeploymentByHubId(hubId: string): Promise<DeploymentTriggerRecord | null>;
  markDeploymentBuilding(input: {
    hubId: string;
    vercelDeploymentId: string;
  }): Promise<void>;
  markDeploymentLive(input: {
    hubId: string;
    vercelDeploymentId: string;
    liveUrl: string;
  }): Promise<void>;
  markDeploymentFailed(input: {
    hubId: string;
    message: string;
    vercelDeploymentId?: string | null;
  }): Promise<void>;
}

export interface DeploymentTriggerEnv {
  VERCEL_GIT_REPO_ID?: string;
  VERCEL_GIT_REF?: string;
  VERCEL_GIT_SHA?: string;
}

export interface TriggerHubDeploymentOptions {
  hubId: string;
  repository: DeploymentTriggerRepository;
  vercel: Pick<VercelClient, 'createDeployment' | 'getDeployment'>;
  env?: DeploymentTriggerEnv;
  force?: boolean;
}

export interface TriggerHubDeploymentResult {
  hubId: string;
  status: DeploymentStatus;
  vercelDeploymentId: string | null;
  liveUrl: string | null;
  lastError: string | null;
}

export class DeploymentNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeploymentNotReadyError';
  }
}

export class MissingDeploymentSourceError extends Error {
  constructor() {
    super('VERCEL_GIT_REPO_ID is required to trigger per-hub Vercel deployments.');
    this.name = 'MissingDeploymentSourceError';
  }
}

const ACTIVE_DEPLOYMENT_STATES = new Set([
  'QUEUED',
  'INITIALIZING',
  'BUILDING',
]);

export async function triggerHubDeployment(
  options: TriggerHubDeploymentOptions,
): Promise<TriggerHubDeploymentResult> {
  const record = await options.repository.findDeploymentByHubId(options.hubId);
  assertReadyToDeploy(record);

  if (!options.force && record.status === 'live' && record.liveUrl) {
    return toResult(record);
  }

  if (record.status === 'building' && record.vercelDeploymentId) {
    const remote = await options.vercel.getDeployment(record.vercelDeploymentId);
    return persistDeploymentState(options.repository, record, remote);
  }

  const request = buildHubDeploymentRequest(
    record,
    options.env ?? readDeploymentTriggerEnv(process.env),
  );

  try {
    const remote = await options.vercel.createDeployment(request);
    return persistDeploymentState(options.repository, record, remote);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deployment trigger failed';
    await options.repository.markDeploymentFailed({
      hubId: record.hubId,
      message,
    });
    throw error;
  }
}

export function buildHubDeploymentRequest(
  record: DeploymentTriggerRecord,
  env: DeploymentTriggerEnv,
): VercelCreateDeploymentRequest {
  if (!env.VERCEL_GIT_REPO_ID) {
    throw new MissingDeploymentSourceError();
  }

  return {
    name: normalizeVercelProjectName(record.hubSlug),
    project: requireValue(record.vercelProjectId, 'Missing Vercel project id.'),
    target: 'production',
    gitSource: {
      type: 'github',
      repoId: env.VERCEL_GIT_REPO_ID,
      ref: env.VERCEL_GIT_REF || 'main',
      ...(env.VERCEL_GIT_SHA ? { sha: env.VERCEL_GIT_SHA } : {}),
    },
    projectSettings: {
      framework: 'nextjs',
      rootDirectory: 'apps/web',
    },
    meta: {
      hubId: record.hubId,
      customDomain: record.customDomain ?? '',
      trigger: 'creatorcanon-domain-ready',
    },
  };
}

export function readDeploymentTriggerEnv(
  env: NodeJS.ProcessEnv,
): DeploymentTriggerEnv {
  return {
    VERCEL_GIT_REPO_ID: env.VERCEL_GIT_REPO_ID,
    VERCEL_GIT_REF: env.VERCEL_GIT_REF,
    VERCEL_GIT_SHA: env.VERCEL_GIT_SHA,
  };
}

export function createDeployTriggerRepository(
  db: AtlasDb,
): DeploymentTriggerRepository {
  return {
    async findDeploymentByHubId(hubId) {
      const rows = await db
        .select({
          hubId: deployment.hubId,
          hubSlug: hub.subdomain,
          vercelProjectId: deployment.vercelProjectId,
          vercelDeploymentId: deployment.vercelDeploymentId,
          customDomain: deployment.customDomain,
          domainVerified: deployment.domainVerified,
          sslReady: deployment.sslReady,
          liveUrl: deployment.liveUrl,
          status: deployment.status,
          lastError: deployment.lastError,
        })
        .from(deployment)
        .innerJoin(hub, and(eq(hub.id, deployment.hubId), eq(hub.id, hubId)))
        .where(eq(deployment.hubId, hubId))
        .limit(1);
      return rows[0] ?? null;
    },

    async markDeploymentBuilding(input) {
      await db
        .update(deployment)
        .set({
          status: 'building',
          vercelDeploymentId: input.vercelDeploymentId,
          liveUrl: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(deployment.hubId, input.hubId));
    },

    async markDeploymentLive(input) {
      await db
        .update(deployment)
        .set({
          status: 'live',
          vercelDeploymentId: input.vercelDeploymentId,
          liveUrl: input.liveUrl,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(deployment.hubId, input.hubId));
    },

    async markDeploymentFailed(input) {
      const next: {
        status: 'failed';
        vercelDeploymentId?: string | null;
        lastError: string;
        updatedAt: Date;
      } = {
        status: 'failed',
        lastError: input.message,
        updatedAt: new Date(),
      };
      if (input.vercelDeploymentId !== undefined) {
        next.vercelDeploymentId = input.vercelDeploymentId;
      }

      await db
        .update(deployment)
        .set(next)
        .where(eq(deployment.hubId, input.hubId));
    },
  };
}

async function persistDeploymentState(
  repository: DeploymentTriggerRepository,
  record: DeploymentTriggerRecord,
  remote: VercelDeployment,
): Promise<TriggerHubDeploymentResult> {
  if (remote.readyState === 'READY') {
    const liveUrl = `https://${record.customDomain}`;
    await repository.markDeploymentLive({
      hubId: record.hubId,
      vercelDeploymentId: remote.id,
      liveUrl,
    });
    return {
      hubId: record.hubId,
      status: 'live',
      vercelDeploymentId: remote.id,
      liveUrl,
      lastError: null,
    };
  }

  if (remote.readyState && ACTIVE_DEPLOYMENT_STATES.has(remote.readyState)) {
    await repository.markDeploymentBuilding({
      hubId: record.hubId,
      vercelDeploymentId: remote.id,
    });
    return {
      hubId: record.hubId,
      status: 'building',
      vercelDeploymentId: remote.id,
      liveUrl: null,
      lastError: null,
    };
  }

  const message =
    remote.errorMessage ??
    remote.errorCode ??
    `Vercel deployment ended in ${remote.readyState ?? 'an unknown state'}.`;
  await repository.markDeploymentFailed({
    hubId: record.hubId,
    vercelDeploymentId: remote.id,
    message,
  });
  return {
    hubId: record.hubId,
    status: 'failed',
    vercelDeploymentId: remote.id,
    liveUrl: null,
    lastError: message,
  };
}

function assertReadyToDeploy(
  record: DeploymentTriggerRecord | null,
): asserts record is DeploymentTriggerRecord & {
  vercelProjectId: string;
  customDomain: string;
} {
  if (!record) {
    throw new DeploymentNotReadyError('No deployment record exists for this hub.');
  }
  if (!record.vercelProjectId) {
    throw new DeploymentNotReadyError('Vercel project has not been created yet.');
  }
  if (!record.customDomain) {
    throw new DeploymentNotReadyError('Custom domain is not attached yet.');
  }
  if (!record.domainVerified) {
    throw new DeploymentNotReadyError('Custom domain is not verified yet.');
  }
  if (!record.sslReady) {
    throw new DeploymentNotReadyError('SSL certificate is not ready yet.');
  }
}

function toResult(record: DeploymentTriggerRecord): TriggerHubDeploymentResult {
  return {
    hubId: record.hubId,
    status: record.status,
    vercelDeploymentId: record.vercelDeploymentId,
    liveUrl: record.liveUrl,
    lastError: record.lastError,
  };
}

function requireValue(value: string | null, message: string): string {
  if (!value) throw new DeploymentNotReadyError(message);
  return value;
}
