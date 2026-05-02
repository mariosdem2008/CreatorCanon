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
): DomainAttachmentRepository {
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
  };
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
