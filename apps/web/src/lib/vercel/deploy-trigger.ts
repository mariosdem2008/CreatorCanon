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
import { VercelApiError } from './client';
import { buildHubSubdomainHostname } from '../hub/public-url';
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
  markDeploymentStarting?(input: { hubId: string }): Promise<boolean>;
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
  NEXT_PUBLIC_HUB_ROOT_DOMAIN?: string;
}

export interface TriggerHubDeploymentOptions {
  hubId: string;
  repository: DeploymentTriggerRepository;
  vercel: Pick<
    VercelClient,
    'createDeployment' | 'getDeployment' | 'addProjectDomain' | 'getProjectDomain'
  >;
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
  const env = options.env ?? readDeploymentTriggerEnv(process.env);
  assertReadyToDeploy(record, env);
  const target = resolveDeploymentTarget(record, env);

  if (!options.force && record.status === 'live' && record.liveUrl === rootHubUrl(target)) {
    return toResult(record);
  }

  if (record.status === 'building' && record.vercelDeploymentId) {
    const remote = await options.vercel.getDeployment(record.vercelDeploymentId);
    return persistDeploymentState(options.repository, record, target, remote);
  }

  const request = buildHubDeploymentRequest(record, env);
  if (!options.force && options.repository.markDeploymentStarting) {
    const claimed = await options.repository.markDeploymentStarting({ hubId: record.hubId });
    if (!claimed) {
      return {
        hubId: record.hubId,
        status: 'building',
        vercelDeploymentId: record.vercelDeploymentId,
        liveUrl: null,
        lastError: null,
      };
    }
  }

  try {
    if (target.kind === 'fallback') {
      await addOrReuseOwnedFallbackDomain(
        options.vercel,
        record.vercelProjectId,
        target.domain,
      );
    }
    const remote = await options.vercel.createDeployment(request);
    return persistDeploymentState(options.repository, record, target, remote);
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
  const publicDomain =
    record.customDomain ?? buildHubSubdomainHostname(record.hubSlug, env) ?? '';

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
      publicDomain,
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
    NEXT_PUBLIC_HUB_ROOT_DOMAIN: env.NEXT_PUBLIC_HUB_ROOT_DOMAIN,
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

    async markDeploymentStarting(input) {
      const rows = await db
        .update(deployment)
        .set({
          status: 'building',
          liveUrl: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(deployment.hubId, input.hubId), eq(deployment.status, 'pending')))
        .returning({ hubId: deployment.hubId });
      return rows.length > 0;
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
  target: DeploymentTarget,
  remote: VercelDeployment,
): Promise<TriggerHubDeploymentResult> {
  if (remote.readyState === 'READY') {
    const aliasError = getAliasErrorMessage(remote);
    if (aliasError) {
      return markFailed(repository, record, remote, aliasError);
    }
    if (!remote.aliasAssigned || !deploymentAliases(remote).includes(target.domain)) {
      return persistActiveDeployment(repository, record, remote);
    }

    const liveUrl = rootHubUrl(target);
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
    return persistActiveDeployment(repository, record, remote);
  }

  const message =
    remote.errorMessage ??
    remote.errorCode ??
    `Vercel deployment ended in ${remote.readyState ?? 'an unknown state'}.`;
  return markFailed(repository, record, remote, message);
}

async function persistActiveDeployment(
  repository: DeploymentTriggerRepository,
  record: DeploymentTriggerRecord,
  remote: VercelDeployment,
): Promise<TriggerHubDeploymentResult> {
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

async function markFailed(
  repository: DeploymentTriggerRepository,
  record: DeploymentTriggerRecord,
  remote: VercelDeployment,
  message: string,
): Promise<TriggerHubDeploymentResult> {
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

type DeploymentTarget =
  | { kind: 'custom'; domain: string }
  | { kind: 'fallback'; domain: string };

function resolveDeploymentTarget(
  record: DeploymentTriggerRecord & { vercelProjectId: string },
  env: DeploymentTriggerEnv,
): DeploymentTarget {
  if (record.customDomain) {
    return { kind: 'custom', domain: record.customDomain };
  }

  const fallbackDomain = buildHubSubdomainHostname(record.hubSlug, env);
  if (!fallbackDomain) {
    throw new DeploymentNotReadyError(
      'Custom domain is not attached and NEXT_PUBLIC_HUB_ROOT_DOMAIN is not configured.',
    );
  }
  return { kind: 'fallback', domain: fallbackDomain };
}

function rootHubUrl(target: DeploymentTarget): string {
  return `https://${target.domain}`;
}

function getAliasErrorMessage(remote: VercelDeployment): string | null {
  const aliasError = remote.aliasError;
  if (!aliasError) return null;
  if (typeof aliasError === 'string') return aliasError;
  return aliasError.message ?? aliasError.code ?? 'Vercel alias assignment failed.';
}

function deploymentAliases(remote: VercelDeployment): string[] {
  return [...(remote.alias ?? []), ...(remote.userAliases ?? [])];
}

function assertReadyToDeploy(
  record: DeploymentTriggerRecord | null,
  env: DeploymentTriggerEnv,
): asserts record is DeploymentTriggerRecord & { vercelProjectId: string } {
  if (!record) {
    throw new DeploymentNotReadyError('No deployment record exists for this hub.');
  }
  if (!record.vercelProjectId) {
    throw new DeploymentNotReadyError('Vercel project has not been created yet.');
  }
  if (!record.customDomain) {
    if (!buildHubSubdomainHostname(record.hubSlug, env)) {
      throw new DeploymentNotReadyError(
        'Custom domain is not attached and NEXT_PUBLIC_HUB_ROOT_DOMAIN is not configured.',
      );
    }
    return;
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

async function addOrReuseOwnedFallbackDomain(
  vercel: Pick<VercelClient, 'addProjectDomain' | 'getProjectDomain'>,
  projectId: string,
  domain: string,
): Promise<void> {
  try {
    await vercel.addProjectDomain(projectId, domain);
  } catch (error) {
    if (isIdempotentDomainConflict(error)) {
      await vercel.getProjectDomain(projectId, domain);
      return;
    }
    throw error;
  }
}

function isIdempotentDomainConflict(error: unknown): boolean {
  if (!(error instanceof VercelApiError)) return false;
  return error.status === 409 && error.code === 'domain_already_exists';
}
