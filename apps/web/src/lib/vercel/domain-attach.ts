import { eq, type AtlasDb } from '@creatorcanon/db';
import { deployment, hub } from '@creatorcanon/db/schema';

import {
  VercelApiError,
  type VercelCert,
  type VercelClient,
  type VercelProjectDomain,
} from './client';

export interface DomainAttachmentRepository {
  updateDomainState(input: {
    hubId: string;
    customDomain: string;
    domainVerified: boolean;
    attachedAt?: Date;
  }): Promise<void>;
}

export interface DeploymentDomainStatus {
  hubId: string;
  vercelProjectId: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  sslReady: boolean;
  vercelCertId: string | null;
  liveUrl: string | null;
  status: string;
  domainAttachedAt: Date | null;
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
    vercelCertId?: string | null;
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
      const now = input.attachedAt ?? new Date();
      await db
        .update(hub)
        .set({ customDomain: input.customDomain, updatedAt: now })
        .where(eq(hub.id, input.hubId));
      await db
        .update(deployment)
        .set({
          customDomain: input.customDomain,
          domainVerified: input.domainVerified,
          sslReady: false,
          vercelCertId: null,
          vercelDeploymentId: null,
          status: 'pending',
          liveUrl: null,
          lastError: null,
          domainAttachedAt: now,
          updatedAt: now,
        })
        .where(eq(deployment.hubId, input.hubId));
    },

    async findDomainStatusByHubId(hubId) {
      const rows = await db
        .select({
          hubId: deployment.hubId,
          vercelProjectId: deployment.vercelProjectId,
          customDomain: deployment.customDomain,
          domainVerified: deployment.domainVerified,
          sslReady: deployment.sslReady,
          vercelCertId: deployment.vercelCertId,
          liveUrl: deployment.liveUrl,
          status: deployment.status,
          domainAttachedAt: deployment.domainAttachedAt,
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
          vercelCertId: input.vercelCertId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(deployment.hubId, input.hubId));
    },
  };
}

export async function refreshDomainVerificationStatus(options: {
  hubId: string;
  vercel: Pick<VercelClient, 'getProjectDomain' | 'verifyProjectDomain'>;
  repository: DomainStatusRepository;
}): Promise<DeploymentDomainStatus & { verification?: VercelProjectDomain['verification'] }> {
  const current = await options.repository.findDomainStatusByHubId(options.hubId);
  if (!current?.vercelProjectId || !current.customDomain) {
    throw new Error('Deployment does not have a Vercel project domain to verify.');
  }

  const remote = await getOrVerifyProjectDomain(
    options.vercel,
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
  vercel: Pick<VercelClient, 'getDomainConfig' | 'issueCert' | 'getCertById'>;
  repository: DomainStatusRepository;
}): Promise<
  DeploymentDomainStatus & { misconfigured: boolean; cert: VercelCert | null }
> {
  const current = await options.repository.findDomainStatusByHubId(options.hubId);
  if (!current?.vercelProjectId || !current.customDomain) {
    throw new Error('Deployment does not have a Vercel project domain to inspect.');
  }

  const config = await options.vercel.getDomainConfig(current.customDomain, {
    projectIdOrName: current.vercelProjectId,
    strict: true,
  });
  if (!current.domainVerified || config.misconfigured) {
    if (current.sslReady || current.vercelCertId) {
      await options.repository.updateSslStatus({
        hubId: current.hubId,
        sslReady: false,
        vercelCertId: null,
      });
    }
    return { ...current, sslReady: false, misconfigured: config.misconfigured, cert: null };
  }

  const customDomain = current.customDomain;
  const cert = await getOrIssueCert(options.vercel, {
    ...current,
    customDomain,
  });
  const sslReady = cert.cns.includes(customDomain);
  if (sslReady !== current.sslReady || cert.id !== current.vercelCertId) {
    await options.repository.updateSslStatus({
      hubId: current.hubId,
      sslReady,
      vercelCertId: cert.id,
    });
  }

  return {
    ...current,
    sslReady,
    vercelCertId: cert.id,
    misconfigured: config.misconfigured,
    cert,
  };
}

async function getOrVerifyProjectDomain(
  vercel: Pick<VercelClient, 'getProjectDomain' | 'verifyProjectDomain'>,
  projectId: string,
  domain: string,
): Promise<VercelProjectDomain> {
  const remote = await vercel.getProjectDomain(projectId, domain);
  if (remote.verified) return remote;

  try {
    return await vercel.verifyProjectDomain(projectId, domain);
  } catch (error) {
    if (isPendingVerificationError(error)) return remote;
    throw error;
  }
}

async function getOrIssueCert(
  vercel: Pick<VercelClient, 'issueCert' | 'getCertById'>,
  current: DeploymentDomainStatus & { customDomain: string },
): Promise<VercelCert> {
  if (current.vercelCertId) {
    return vercel.getCertById(current.vercelCertId);
  }
  return vercel.issueCert([current.customDomain]);
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

function isPendingVerificationError(error: unknown): boolean {
  if (!(error instanceof VercelApiError)) return false;
  if (error.status !== 400 && error.status !== 409) return false;
  const code = error.code?.toLowerCase() ?? '';
  return (
    code.includes('verification') ||
    code.includes('domain_not_verified') ||
    code.includes('invalid_domain')
  );
}
