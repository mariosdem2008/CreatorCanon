import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VercelApiError, type VercelClient } from './client';
import {
  DeploymentNotReadyError,
  buildHubDeploymentRequest,
  triggerHubDeployment,
  type DeploymentTriggerRepository,
} from './deploy-trigger';

function createReadyRecord(
  overrides: Partial<Awaited<ReturnType<DeploymentTriggerRepository['findDeploymentByHubId']>>> = {},
): NonNullable<Awaited<ReturnType<DeploymentTriggerRepository['findDeploymentByHubId']>>> {
  return {
    hubId: 'hub_123',
    hubSlug: 'demo-hub',
    vercelProjectId: 'prj_123',
    vercelDeploymentId: null,
    customDomain: 'learn.example.com',
    domainVerified: true,
    sslReady: true,
    liveUrl: null,
    status: 'pending',
    lastError: null,
    ...overrides,
  };
}

function createRepository(record = createReadyRecord()) {
  const calls: string[] = [];
  const repository: DeploymentTriggerRepository = {
    async findDeploymentByHubId() {
      calls.push('find');
      return record;
    },
    async markDeploymentBuilding(input) {
      calls.push(`building:${input.vercelDeploymentId}`);
      record.status = 'building';
      record.vercelDeploymentId = input.vercelDeploymentId;
      record.liveUrl = null;
      record.lastError = null;
    },
    async markDeploymentLive(input) {
      calls.push(`live:${input.vercelDeploymentId}:${input.liveUrl}`);
      record.status = 'live';
      record.vercelDeploymentId = input.vercelDeploymentId;
      record.liveUrl = input.liveUrl;
      record.lastError = null;
    },
    async markDeploymentFailed(input) {
      calls.push(`failed:${input.message}`);
      record.status = 'failed';
      record.vercelDeploymentId = input.vercelDeploymentId ?? record.vercelDeploymentId;
      record.lastError = input.message;
    },
  };
  return { calls, record, repository };
}

function createVercelClient(
  overrides: Partial<
    Pick<
      VercelClient,
      'createDeployment' | 'getDeployment' | 'addProjectDomain' | 'getProjectDomain'
    >
  > = {},
): Pick<
  VercelClient,
  'createDeployment' | 'getDeployment' | 'addProjectDomain' | 'getProjectDomain'
> {
  return {
    async createDeployment() {
      throw new Error('unexpected create');
    },
    async getDeployment() {
      throw new Error('unexpected get');
    },
    async addProjectDomain() {
      throw new Error('unexpected add domain');
    },
    async getProjectDomain() {
      throw new Error('unexpected get domain');
    },
    ...overrides,
  };
}

describe('buildHubDeploymentRequest', () => {
  it('builds a production Git deployment request for the hub project', () => {
    const request = buildHubDeploymentRequest(createReadyRecord(), {
      VERCEL_GIT_REPO_ID: '123456',
      VERCEL_GIT_REF: 'main',
      VERCEL_GIT_SHA: 'abc123',
      NEXT_PUBLIC_HUB_ROOT_DOMAIN: 'creatorcanon.app',
    });

    assert.equal(request.name, 'creator-canon-demo-hub');
    assert.equal(request.project, 'prj_123');
    assert.equal(request.target, 'production');
    assert.deepEqual(request.gitSource, {
      type: 'github',
      repoId: '123456',
      ref: 'main',
      sha: 'abc123',
    });
    assert.deepEqual(request.projectSettings, {
      framework: 'nextjs',
      rootDirectory: 'apps/web',
    });
    assert.equal(request.meta?.hubId, 'hub_123');
    assert.equal(request.meta?.publicDomain, 'learn.example.com');
  });

  it('uses the creatorcanon subdomain as the public deployment domain without a custom domain', () => {
    const request = buildHubDeploymentRequest(
      createReadyRecord({
        customDomain: null,
        domainVerified: false,
        sslReady: false,
      }),
      {
        VERCEL_GIT_REPO_ID: '123456',
        NEXT_PUBLIC_HUB_ROOT_DOMAIN: 'creatorcanon.app',
      },
    );

    assert.equal(request.meta?.customDomain, '');
    assert.equal(request.meta?.publicDomain, 'demo-hub.creatorcanon.app');
  });
});

describe('triggerHubDeployment', () => {
  it('rejects deployments until the custom domain is verified and ssl-ready', async () => {
    const { repository } = createRepository(
      createReadyRecord({ domainVerified: true, sslReady: false }),
    );
    const vercel = createVercelClient();

    await assert.rejects(
      () =>
        triggerHubDeployment({
          hubId: 'hub_123',
          repository,
          vercel,
          env: { VERCEL_GIT_REPO_ID: '123456' },
        }),
      DeploymentNotReadyError,
    );
  });

  it('creates a deployment and marks it building when Vercel queues the build', async () => {
    const { calls, repository } = createRepository();
    const vercelCalls: unknown[] = [];
    const vercel = createVercelClient({
      async createDeployment(request) {
        vercelCalls.push(request);
        return {
          id: 'dpl_123',
          url: 'creator-canon-demo.vercel.app',
          readyState: 'QUEUED',
        };
      },
    });

    const result = await triggerHubDeployment({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456', VERCEL_GIT_REF: 'main' },
    });

    assert.equal(result.status, 'building');
    assert.equal(result.vercelDeploymentId, 'dpl_123');
    assert.equal(result.liveUrl, null);
    assert.deepEqual(calls, ['find', 'building:dpl_123']);
    assert.equal((vercelCalls[0] as { meta: Record<string, string> }).meta.hubId, 'hub_123');
  });

  it('does not create a duplicate deployment when another request claimed the row', async () => {
    const { calls, repository } = createRepository();
    repository.markDeploymentStarting = async () => {
      calls.push('starting:false');
      return false;
    };
    const vercel = createVercelClient();

    const result = await triggerHubDeployment({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456' },
    });

    assert.equal(result.status, 'building');
    assert.deepEqual(calls, ['find', 'starting:false']);
  });

  it('refreshes an in-flight deployment and marks it live once Vercel is ready', async () => {
    const { calls, repository } = createRepository(
      createReadyRecord({
        status: 'building',
        vercelDeploymentId: 'dpl_123',
      }),
    );
    const vercel = createVercelClient({
      async getDeployment() {
        return {
          id: 'dpl_123',
          url: 'creator-canon-demo.vercel.app',
          readyState: 'READY',
          aliasAssigned: true,
          alias: ['learn.example.com'],
        };
      },
    });

    const result = await triggerHubDeployment({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456' },
    });

    assert.equal(result.status, 'live');
    assert.equal(result.liveUrl, 'https://learn.example.com');
    assert.deepEqual(calls, [
      'find',
      'live:dpl_123:https://learn.example.com',
    ]);
  });

  it('keeps a ready deployment building until the custom domain alias is assigned', async () => {
    const { calls, repository } = createRepository(
      createReadyRecord({
        status: 'building',
        vercelDeploymentId: 'dpl_123',
      }),
    );
    const vercel = createVercelClient({
      async getDeployment() {
        return {
          id: 'dpl_123',
          url: 'creator-canon-demo.vercel.app',
          readyState: 'READY',
          aliasAssigned: false,
          alias: [],
        };
      },
    });

    const result = await triggerHubDeployment({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456' },
    });

    assert.equal(result.status, 'building');
    assert.equal(result.liveUrl, null);
    assert.deepEqual(calls, ['find', 'building:dpl_123']);
  });

  it('marks ready deployments failed when Vercel reports alias assignment errors', async () => {
    const { calls, repository } = createRepository(
      createReadyRecord({
        status: 'building',
        vercelDeploymentId: 'dpl_123',
      }),
    );
    const vercel = createVercelClient({
      async getDeployment() {
        return {
          id: 'dpl_123',
          url: 'creator-canon-demo.vercel.app',
          readyState: 'READY',
          aliasAssigned: false,
          aliasError: { message: 'Domain alias failed' },
        };
      },
    });

    const result = await triggerHubDeployment({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456' },
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.lastError, 'Domain alias failed');
    assert.deepEqual(calls, ['find', 'failed:Domain alias failed']);
  });

  it('attaches the owned fallback subdomain and deploys without custom-domain verification', async () => {
    const { calls, repository } = createRepository(
      createReadyRecord({
        customDomain: null,
        domainVerified: false,
        sslReady: false,
      }),
    );
    const vercelCalls: string[] = [];
    const vercel = createVercelClient({
      async addProjectDomain(projectId, domain) {
        vercelCalls.push(`add-domain:${projectId}:${domain}`);
        return {
          name: domain,
          projectId,
          verified: true,
        };
      },
      async createDeployment() {
        vercelCalls.push('create');
        return {
          id: 'dpl_123',
          url: 'creator-canon-demo.vercel.app',
          readyState: 'READY',
          aliasAssigned: true,
          alias: ['demo-hub.creatorcanon.app'],
        };
      },
    });

    const result = await triggerHubDeployment({
      hubId: 'hub_123',
      repository,
      vercel,
      env: {
        VERCEL_GIT_REPO_ID: '123456',
        NEXT_PUBLIC_HUB_ROOT_DOMAIN: 'creatorcanon.app',
      },
    });

    assert.equal(result.status, 'live');
    assert.equal(result.liveUrl, 'https://demo-hub.creatorcanon.app');
    assert.deepEqual(vercelCalls, [
      'add-domain:prj_123:demo-hub.creatorcanon.app',
      'create',
    ]);
    assert.deepEqual(calls, [
      'find',
      'live:dpl_123:https://demo-hub.creatorcanon.app',
    ]);
  });

  it('rejects fallback deployment when no hub root domain is configured', async () => {
    const { repository } = createRepository(
      createReadyRecord({
        customDomain: null,
        domainVerified: false,
        sslReady: false,
      }),
    );
    const vercel = createVercelClient();

    await assert.rejects(
      () =>
        triggerHubDeployment({
          hubId: 'hub_123',
          repository,
          vercel,
          env: { VERCEL_GIT_REPO_ID: '123456' },
        }),
      DeploymentNotReadyError,
    );
  });

  it('keeps fallback deployments building until the fallback alias is assigned', async () => {
    const { calls, repository } = createRepository(
      createReadyRecord({
        status: 'building',
        vercelDeploymentId: 'dpl_123',
        customDomain: null,
        domainVerified: false,
        sslReady: false,
      }),
    );
    const vercel = createVercelClient({
      async getDeployment() {
        return {
          id: 'dpl_123',
          url: 'creator-canon-demo.vercel.app',
          readyState: 'READY',
          aliasAssigned: false,
          alias: [],
        };
      },
    });

    const result = await triggerHubDeployment({
      hubId: 'hub_123',
      repository,
      vercel,
      env: {
        VERCEL_GIT_REPO_ID: '123456',
        NEXT_PUBLIC_HUB_ROOT_DOMAIN: 'creatorcanon.app',
      },
    });

    assert.equal(result.status, 'building');
    assert.equal(result.liveUrl, null);
    assert.deepEqual(calls, ['find', 'building:dpl_123']);
  });

  it('marks the deployment failed when Vercel rejects the build trigger', async () => {
    const { calls, repository } = createRepository();
    const vercel = createVercelClient({
      async createDeployment() {
        throw new VercelApiError({
          status: 400,
          code: 'bad_request',
          message: 'gitSource is invalid',
          responseBody: {},
        });
      },
    });

    await assert.rejects(() =>
      triggerHubDeployment({
        hubId: 'hub_123',
        repository,
        vercel,
        env: { VERCEL_GIT_REPO_ID: '123456' },
      }),
    );

    assert.deepEqual(calls, ['find', 'failed:gitSource is invalid']);
  });

  it('does not persist failure when deployment source env is missing', async () => {
    const { calls, repository } = createRepository();
    const vercel = createVercelClient();

    await assert.rejects(() =>
      triggerHubDeployment({
        hubId: 'hub_123',
        repository,
        vercel,
        env: {},
      }),
    );

    assert.deepEqual(calls, ['find']);
  });
});
