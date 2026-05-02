import { eq, type AtlasDb } from '@creatorcanon/db';
import { deployment, hub } from '@creatorcanon/db/schema';

import {
  VercelApiError,
  type VercelClient,
  type VercelProjectDomain,
} from './client';

export interface DomainAttachmentRepository {
  updateDomainState(input: {
    hubId: string;
    customDomain: string;
    domainVerified: boolean;
  }): Promise<void>;
}

export interface DeploymentDomainStatus {
  hubId: string;
  vercelProjectId: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  sslReady: boolean;
  liveUrl: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainStatusRepository {
  findDomainStatusByHubId(hubId: string): Promise<DeploymentDomainStatus | null>;
  updateDomainVerification(input: {
    hubId: string;
    domainVerified: boolean;
  }): Promise<void>;
  updateSslStatus(input: {
    hubId: string;
    sslReady: boolean;
  }): Promise<void>;
}

export interface AttachDomainToProjectOptions {
  hubId: string;
  vercelProjectId: string;
  domain: string;
  vercel: Pick<VercelClient, 'addProjectDomain' | 'getProjectDomain'>;
  repository: DomainAttachmentRepository;
}

export async function attachDomainToVercelProject(
  options: AttachDomainToProjectOptions,
): Promise<VercelProjectDomain> {
  const attached = await addOrReuseProjectDomain(
    options.vercel,
    options.vercelProjectId,
    options.domain,
  );

  await options.repository.updateDomainState({
    hubId: options.hubId,
    customDomain: attached.name,
    domainVerified: attached.verified,
  });

  return attached;
}

export function createDomainAttachmentRepository(
  db: AtlasDb,
): DomainAttachmentRepository & DomainStatusRepository {
  return {
    async updateDomainState(input) {
      await db
        .update(deployment)
        .set({
          customDomain: input.customDomain,
          domainVerified: input.domainVerified,
          updatedAt: new Date(),
        })
        .where(eq(deployment.hubId, input.hubId));
      await db
        .update(hub)
        .set({ customDomain: input.customDomain, updatedAt: new Date() })
        .where(eq(hub.id, input.hubId));
    },

    async findDomainStatusByHubId(hubId) {
      const rows = await db
        .select({
          hubId: deployment.hubId,
          vercelProjectId: deployment.vercelProjectId,
          customDomain: deployment.customDomain,
          domainVerified: deployment.domainVerified,
          sslReady: deployment.sslReady,
          liveUrl: deployment.liveUrl,
          status: deployment.status,
          createdAt: deployment.createdAt,
          updatedAt: deployment.updatedAt,
        })
        .from(deployment)
        .where(eq(deployment.hubId, hubId))
        .limit(1);
      return rows[0] ?? null;
    },

    async updateDomainVerification(input) {
      await db
        .update(deployment)
        .set({
          domainVerified: input.domainVerified,
          updatedAt: new Date(),
        })
        .where(eq(deployment.hubId, input.hubId));
    },

    async updateSslStatus(input) {
      await db
        .update(deployment)
        .set({
          sslReady: input.sslReady,
          updatedAt: new Date(),
        })
        .where(eq(deployment.hubId, input.hubId));
    },
  };
}

export async function refreshDomainVerificationStatus(options: {
  hubId: string;
  vercel: Pick<VercelClient, 'getProjectDomain'>;
  repository: DomainStatusRepository;
}): Promise<DeploymentDomainStatus & { verification?: VercelProjectDomain['verification'] }> {
  const current = await options.repository.findDomainStatusByHubId(options.hubId);
  if (!current?.vercelProjectId || !current.customDomain) {
    throw new Error('Deployment does not have a Vercel project domain to verify.');
  }

  const remote = await options.vercel.getProjectDomain(
    current.vercelProjectId,
    current.customDomain,
  );
  if (remote.verified !== current.domainVerified) {
    await options.repository.updateDomainVerification({
      hubId: current.hubId,
      domainVerified: remote.verified,
    });
  }

  return {
    ...current,
    domainVerified: remote.verified,
    verification: remote.verification,
  };
}

export async function refreshSslStatus(options: {
  hubId: string;
  vercel: Pick<VercelClient, 'getDomainConfig'>;
  repository: DomainStatusRepository;
}): Promise<DeploymentDomainStatus & { misconfigured: boolean }> {
  const current = await options.repository.findDomainStatusByHubId(options.hubId);
  if (!current?.vercelProjectId || !current.customDomain) {
    throw new Error('Deployment does not have a Vercel project domain to inspect.');
  }

  const config = await options.vercel.getDomainConfig(current.customDomain, {
    projectIdOrName: current.vercelProjectId,
    strict: true,
  });
  const sslReady = current.domainVerified && !config.misconfigured;
  if (sslReady !== current.sslReady) {
    await options.repository.updateSslStatus({
      hubId: current.hubId,
      sslReady,
    });
  }

  return { ...current, sslReady, misconfigured: config.misconfigured };
}

async function addOrReuseProjectDomain(
  vercel: Pick<VercelClient, 'addProjectDomain' | 'getProjectDomain'>,
  projectId: string,
  domain: string,
): Promise<VercelProjectDomain> {
  try {
    return await vercel.addProjectDomain(projectId, domain);
  } catch (error) {
    if (isIdempotentDomainConflict(error)) {
      return vercel.getProjectDomain(projectId, domain);
    }
    throw error;
  }
}

function isIdempotentDomainConflict(error: unknown): boolean {
  if (!(error instanceof VercelApiError)) return false;
  return error.status === 409 && error.code === 'domain_already_exists';
}
