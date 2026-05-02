import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VercelApiError, type VercelClient } from './client';
import {
  DeploymentNotReadyError,
  type DeploymentTriggerRepository,
} from './deploy-trigger';
import { triggerRedeployAfterPublish } from './redeploy';

function createRepository(status: 'ready' | 'not-ready' = 'ready') {
  const calls: string[] = [];
  const repository: DeploymentTriggerRepository = {
    async findDeploymentByHubId(hubId) {
      calls.push(`find:${hubId}`);
      if (status === 'not-ready') {
        throw new DeploymentNotReadyError('Custom domain is not attached yet.');
      }
      return {
        hubId,
        hubSlug: 'demo-hub',
        vercelProjectId: 'prj_123',
        vercelDeploymentId: 'dpl_old',
        customDomain: 'learn.example.com',
        domainVerified: true,
        sslReady: true,
        liveUrl: 'https://learn.example.com',
        status: 'live',
        lastError: null,
      };
    },
    async markDeploymentBuilding(input) {
      calls.push(`building:${input.vercelDeploymentId}`);
    },
    async markDeploymentLive(input) {
      calls.push(`live:${input.vercelDeploymentId}:${input.liveUrl}`);
    },
    async markDeploymentFailed(input) {
      calls.push(`failed:${input.message}`);
    },
  };
  return { calls, repository };
}

describe('triggerRedeployAfterPublish', () => {
  it('forces a new deployment for a published hub with ready domain hosting', async () => {
    const { calls, repository } = createRepository();
    repository.markDeploymentStarting = async () => {
      calls.push('unexpected-starting-claim');
      return false;
    };
    const vercel: Pick<VercelClient, 'createDeployment' | 'getDeployment'> = {
      async createDeployment() {
        return {
          id: 'dpl_new',
          url: 'creator-canon-demo.vercel.app',
          readyState: 'QUEUED',
        };
      },
      async getDeployment() {
        throw new Error('unexpected get');
      },
    };

    const result = await triggerRedeployAfterPublish({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456' },
    });

    assert.equal(result.triggered, true);
    assert.equal(result.status, 'building');
    assert.deepEqual(calls, ['find:hub_123', 'building:dpl_new']);
  });

  it('skips without throwing when the hub has no ready custom-domain deployment', async () => {
    const { calls, repository } = createRepository('not-ready');
    const vercel: Pick<VercelClient, 'createDeployment' | 'getDeployment'> = {
      async createDeployment() {
        throw new Error('unexpected create');
      },
      async getDeployment() {
        throw new Error('unexpected get');
      },
    };

    const result = await triggerRedeployAfterPublish({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456' },
    });

    assert.equal(result.triggered, false);
    assert.equal(result.reason, 'Custom domain is not attached yet.');
    assert.deepEqual(calls, ['find:hub_123']);
  });

  it('returns a failed result for Vercel trigger errors after persistence handles the failure', async () => {
    const { calls, repository } = createRepository();
    const vercel: Pick<VercelClient, 'createDeployment' | 'getDeployment'> = {
      async createDeployment() {
        throw new VercelApiError({
          status: 400,
          code: 'bad_request',
          message: 'gitSource is invalid',
          responseBody: {},
        });
      },
      async getDeployment() {
        throw new Error('unexpected get');
      },
    };

    const result = await triggerRedeployAfterPublish({
      hubId: 'hub_123',
      repository,
      vercel,
      env: { VERCEL_GIT_REPO_ID: '123456' },
    });

    assert.equal(result.triggered, false);
    assert.equal(result.reason, 'gitSource is invalid');
    assert.deepEqual(calls, ['find:hub_123', 'failed:gitSource is invalid']);
  });
});
