import { randomUUID } from 'node:crypto';
import { eq, type AtlasDb } from '@creatorcanon/db';
import { deployment, type DeploymentStatus } from '@creatorcanon/db/schema';

import type {
  VercelClient,
  VercelCreateProjectRequest,
  VercelProject,
} from './client';
import { VercelApiError } from './client';

export interface HubDeploymentInput {
  hubId: string;
  hubSlug: string;
  customDomain?: string | null;
}

export interface DeploymentRecord {
  id: string;
  hubId: string;
  vercelProjectId: string | null;
}

export interface DeploymentRepository {
  findDeploymentByHubId(hubId: string): Promise<DeploymentRecord | null>;
  reserveDeployment(input: {
    id: string;
    hubId: string;
    status: DeploymentStatus;
  }): Promise<DeploymentRecord>;
  upsertDeployment(input: {
    id: string;
    hubId: string;
    vercelProjectId: string;
    status: DeploymentStatus;
  }): Promise<DeploymentRecord>;
}

export interface CreateHubVercelProjectOptions {
  hub: HubDeploymentInput;
  vercel: Pick<VercelClient, 'createProject' | 'getProject'>;
  repository: DeploymentRepository;
  env?: VercelProjectEnv;
  idFactory?: () => string;
}

export type VercelProjectEnv = Partial<
  Record<'DATABASE_URL' | 'NEXT_PUBLIC_APP_URL' | 'NEXT_PUBLIC_HUB_ROOT_DOMAIN', string>
>;

export class MissingVercelProjectEnvError extends Error {
  constructor(missingKeys: string[]) {
    super(`Missing required Vercel project env: ${missingKeys.join(', ')}`);
    this.name = 'MissingVercelProjectEnvError';
  }
}

export interface HubVercelProjectResult {
  deploymentId: string;
  hubId: string;
  vercelProjectId: string;
  vercelProject: VercelProject | null;
  reusedExistingProject: boolean;
}

export function normalizeVercelProjectName(hubSlug: string): string {
  const slug = hubSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  const safeSlug = slug || 'hub';
  return `creator-canon-${safeSlug}`.slice(0, 63).replace(/-+$/g, '');
}

export async function createHubVercelProject(
  options: CreateHubVercelProjectOptions,
): Promise<HubVercelProjectResult> {
  const existing = await options.repository.findDeploymentByHubId(options.hub.hubId);
  if (existing?.vercelProjectId) {
    return {
      deploymentId: existing.id,
      hubId: existing.hubId,
      vercelProjectId: existing.vercelProjectId,
      vercelProject: null,
      reusedExistingProject: true,
    };
  }

  const projectRequest = buildHubProjectRequest(options.hub, options.env ?? {});
  const idFactory = options.idFactory ?? randomUUID;
  const reserved = await options.repository.reserveDeployment({
    id: existing?.id ?? idFactory(),
    hubId: options.hub.hubId,
    status: 'pending',
  });
  if (reserved.vercelProjectId) {
    return {
      deploymentId: reserved.id,
      hubId: reserved.hubId,
      vercelProjectId: reserved.vercelProjectId,
      vercelProject: null,
      reusedExistingProject: true,
    };
  }

  const vercelProject = await createProjectOrReuseDeterministic(
    options.vercel,
    projectRequest,
  );
  const persisted = await options.repository.upsertDeployment({
    id: reserved.id,
    hubId: options.hub.hubId,
    vercelProjectId: vercelProject.id,
    status: 'pending',
  });

  return {
    deploymentId: persisted.id,
    hubId: persisted.hubId,
    vercelProjectId: vercelProject.id,
    vercelProject,
    reusedExistingProject: false,
  };
}

async function createProjectOrReuseDeterministic(
  vercel: Pick<VercelClient, 'createProject' | 'getProject'>,
  projectRequest: VercelCreateProjectRequest,
): Promise<VercelProject> {
  try {
    return await vercel.createProject(projectRequest);
  } catch (error) {
    if (isVercelProjectConflict(error)) {
      return vercel.getProject(projectRequest.name);
    }
    throw error;
  }
}

function isVercelProjectConflict(error: unknown): boolean {
  if (!(error instanceof VercelApiError)) return false;
  return (
    error.status === 409 ||
    error.code === 'project_name_taken' ||
    error.code === 'project_already_exists'
  );
}

export function buildHubProjectRequest(
  hub: HubDeploymentInput,
  env: VercelProjectEnv,
): VercelCreateProjectRequest {
  return {
    name: normalizeVercelProjectName(hub.hubSlug),
    framework: 'nextjs',
    rootDirectory: 'apps/web',
    environmentVariables: buildHubEnvironmentVariables(hub.hubId, env),
  };
}

export function buildHubEnvironmentVariables(
  hubId: string,
  env: VercelProjectEnv,
): NonNullable<VercelCreateProjectRequest['environmentVariables']> {
  const missing = ['DATABASE_URL', 'NEXT_PUBLIC_APP_URL'].filter(
    (key) => !env[key as keyof VercelProjectEnv],
  );
  if (missing.length > 0) {
    throw new MissingVercelProjectEnvError(missing);
  }

  const variables: Array<[string, string | undefined]> = [
    ['HUB_ID', hubId],
    ['DATABASE_URL', env.DATABASE_URL],
    ['NEXT_PUBLIC_APP_URL', env.NEXT_PUBLIC_APP_URL],
    ['NEXT_PUBLIC_HUB_ROOT_DOMAIN', env.NEXT_PUBLIC_HUB_ROOT_DOMAIN],
  ];

  return variables
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => ({
      key,
      value,
      target: ['production', 'preview'] as const,
      type: 'encrypted' as const,
    }));
}

export function createDeploymentRepository(db: AtlasDb): DeploymentRepository {
  return {
    async findDeploymentByHubId(hubId) {
      const rows = await db
        .select({
          id: deployment.id,
          hubId: deployment.hubId,
          vercelProjectId: deployment.vercelProjectId,
        })
        .from(deployment)
        .where(eq(deployment.hubId, hubId))
        .limit(1);
      return rows[0] ?? null;
    },

    async upsertDeployment(input) {
      const existingRows = await db
        .select({ id: deployment.id })
        .from(deployment)
        .where(eq(deployment.hubId, input.hubId))
        .limit(1);
      const existing = existingRows[0];
      const now = new Date();

      if (existing) {
        const rows = await db
          .update(deployment)
          .set({
            vercelProjectId: input.vercelProjectId,
            status: input.status,
            updatedAt: now,
          })
          .where(eq(deployment.id, existing.id))
          .returning({
            id: deployment.id,
            hubId: deployment.hubId,
            vercelProjectId: deployment.vercelProjectId,
          });
        return requireRow(rows[0]);
      }

      const rows = await db
        .insert(deployment)
        .values({
          id: input.id,
          hubId: input.hubId,
          vercelProjectId: input.vercelProjectId,
          status: input.status,
        })
        .returning({
          id: deployment.id,
          hubId: deployment.hubId,
          vercelProjectId: deployment.vercelProjectId,
        });
      return requireRow(rows[0]);
    },

    async reserveDeployment(input) {
      await db
        .insert(deployment)
        .values({
          id: input.id,
          hubId: input.hubId,
          status: input.status,
        })
        .onConflictDoNothing({ target: deployment.hubId });

      const rows = await db
        .select({
          id: deployment.id,
          hubId: deployment.hubId,
          vercelProjectId: deployment.vercelProjectId,
        })
        .from(deployment)
        .where(eq(deployment.hubId, input.hubId))
        .limit(1);
      return requireRow(rows[0]);
    },
  };
}

function requireRow<T>(row: T | undefined): T {
  if (!row) {
    throw new Error('Expected deployment persistence to return a row');
  }
  return row;
}
