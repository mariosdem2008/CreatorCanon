import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createHubVercelProject,
  MissingVercelProjectEnvError,
  normalizeVercelProjectName,
  type DeploymentRepository,
  type HubDeploymentInput,
} from './project-create';
import { VercelApiError, type VercelClient } from './client';

function createRepo(existing?: {
  id: string;
  hubId: string;
  vercelProjectId: string | null;
}) {
  const upserts: Array<Parameters<DeploymentRepository['upsertDeployment']>[0]> = [];
  const reserves: Array<Parameters<DeploymentRepository['reserveDeployment']>[0]> = [];
  const events: string[] = [];
  const repo: DeploymentRepository = {
    async findDeploymentByHubId() {
      events.push('find');
      return existing ?? null;
    },
    async reserveDeployment(input) {
      events.push('reserve');
      reserves.push(input);
      return {
        id: existing?.id ?? input.id,
        hubId: input.hubId,
        vercelProjectId: existing?.vercelProjectId ?? null,
      };
    },
    async upsertDeployment(input) {
      events.push('upsert');
      upserts.push(input);
      return {
        id: input.id,
        hubId: input.hubId,
        vercelProjectId: input.vercelProjectId ?? null,
      };
    },
  };

  return { events, repo, reserves, upserts };
}

function createClient(options?: { createProjectError?: unknown }) {
  const projectRequests: Parameters<VercelClient['createProject']>[0][] = [];
  const fetchedProjects: string[] = [];
  const client: Pick<VercelClient, 'createProject' | 'getProject'> = {
    async createProject(request) {
      if (options?.createProjectError) {
        throw options.createProjectError;
      }
      projectRequests.push(request);
      return {
        id: 'prj_123',
        name: request.name,
        framework: request.framework,
        rootDirectory: request.rootDirectory,
      };
    },
    async getProject(idOrName) {
      fetchedProjects.push(idOrName);
      return {
        id: 'prj_existing',
        name: idOrName,
        framework: 'nextjs',
        rootDirectory: 'apps/web',
      };
    },
  };

  return { client, fetchedProjects, projectRequests };
}

const hubInput: HubDeploymentInput = {
  hubId: 'hub_123',
  hubSlug: 'Mario Demo Channel!!',
  customDomain: 'learn.example.com',
};

describe('normalizeVercelProjectName', () => {
  it('builds a creator-canon prefixed slug safe for Vercel projects', () => {
    assert.equal(
      normalizeVercelProjectName('Mario Demo Channel!!'),
      'creator-canon-mario-demo-channel',
    );
  });

  it('keeps project names inside Vercel length limits', () => {
    const result = normalizeVercelProjectName('a'.repeat(120));
    assert.ok(result.startsWith('creator-canon-'));
    assert.ok(result.length <= 63);
  });
});

describe('createHubVercelProject', () => {
  it('creates a Next.js Vercel project with hub environment variables and persists it', async () => {
    const { events, repo, reserves, upserts } = createRepo();
    const { client, projectRequests } = createClient();

    const result = await createHubVercelProject({
      hub: hubInput,
      vercel: client,
      repository: repo,
      env: {
        DATABASE_URL: 'postgres://db',
        NEXT_PUBLIC_APP_URL: 'https://app.creatorcanon.com',
      },
      idFactory: () => 'dep_123',
    });

    assert.equal(result.vercelProjectId, 'prj_123');
    assert.deepEqual(events, ['find', 'reserve', 'upsert']);
    assert.equal(reserves[0]?.hubId, 'hub_123');
    assert.equal(projectRequests.length, 1);
    assert.deepEqual(projectRequests[0], {
      name: 'creator-canon-mario-demo-channel',
      framework: 'nextjs',
      rootDirectory: 'apps/web',
      environmentVariables: [
        {
          key: 'HUB_ID',
          value: 'hub_123',
          target: ['production', 'preview'],
          type: 'encrypted',
        },
        {
          key: 'DATABASE_URL',
          value: 'postgres://db',
          target: ['production', 'preview'],
          type: 'encrypted',
        },
        {
          key: 'NEXT_PUBLIC_APP_URL',
          value: 'https://app.creatorcanon.com',
          target: ['production', 'preview'],
          type: 'encrypted',
        },
      ],
    });
    assert.deepEqual(upserts[0], {
      id: 'dep_123',
      hubId: 'hub_123',
      vercelProjectId: 'prj_123',
      status: 'pending',
    });
  });

  it('does not create another Vercel project when the deployment already has one', async () => {
    const { repo, reserves, upserts } = createRepo({
      id: 'dep_existing',
      hubId: 'hub_123',
      vercelProjectId: 'prj_existing',
    });
    const { client, projectRequests } = createClient();

    const result = await createHubVercelProject({
      hub: hubInput,
      vercel: client,
      repository: repo,
      env: {},
      idFactory: () => 'dep_new',
    });

    assert.equal(result.vercelProjectId, 'prj_existing');
    assert.equal(projectRequests.length, 0);
    assert.equal(reserves.length, 0);
    assert.equal(upserts.length, 0);
  });

  it('reuses the deterministic Vercel project when createProject reports a conflict', async () => {
    const { repo, upserts } = createRepo();
    const { client, fetchedProjects } = createClient({
      createProjectError: new VercelApiError({
        status: 409,
        code: 'project_name_taken',
        message: 'Project name is already taken',
        responseBody: {},
      }),
    });

    const result = await createHubVercelProject({
      hub: hubInput,
      vercel: client,
      repository: repo,
      env: {
        DATABASE_URL: 'postgres://db',
        NEXT_PUBLIC_APP_URL: 'https://app.creatorcanon.com',
      },
      idFactory: () => 'dep_123',
    });

    assert.equal(result.vercelProjectId, 'prj_existing');
    assert.deepEqual(fetchedProjects, ['creator-canon-mario-demo-channel']);
    assert.equal(upserts[0]?.vercelProjectId, 'prj_existing');
    assert.equal('customDomain' in upserts[0]!, false);
  });

  it('fails before creating a Vercel project when required env is missing', async () => {
    const { repo, reserves } = createRepo();
    const { client, projectRequests } = createClient();

    await assert.rejects(
      () =>
        createHubVercelProject({
          hub: hubInput,
          vercel: client,
          repository: repo,
          env: { NEXT_PUBLIC_APP_URL: 'https://app.creatorcanon.com' },
          idFactory: () => 'dep_123',
        }),
      MissingVercelProjectEnvError,
    );

    assert.equal(reserves.length, 0);
    assert.equal(projectRequests.length, 0);
  });
});
