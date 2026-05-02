import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VercelApiError, type VercelClient } from './client';
import {
  attachDomainToVercelProject,
  refreshDomainVerificationStatus,
  refreshSslStatus,
  type DomainAttachmentRepository,
  type DomainStatusRepository,
} from './domain-attach';

function createRepository() {
  const updates: Array<Parameters<DomainAttachmentRepository['updateDomainState']>[0]> = [];
  const repository: DomainAttachmentRepository = {
    async updateDomainState(input) {
      updates.push(input);
    },
  };
  return { repository, updates };
}

function createClient(options?: { attachError?: unknown }) {
  const calls: string[] = [];
  const client: Pick<VercelClient, 'addProjectDomain' | 'getProjectDomain'> = {
    async addProjectDomain(projectId, domain) {
      calls.push(`add:${projectId}:${domain}`);
      if (options?.attachError) throw options.attachError;
      return {
        name: domain,
        projectId,
        verified: false,
        verification: [{ type: 'TXT', domain: `_vercel.${domain}`, value: 'token' }],
      };
    },
    async getProjectDomain(projectId, domain) {
      calls.push(`get:${projectId}:${domain}`);
      return {
        name: domain,
        projectId,
        verified: true,
      };
    },
  };

  return { calls, client };
}

describe('attachDomainToVercelProject', () => {
  it('attaches a domain and persists verification state', async () => {
    const { repository, updates } = createRepository();
    const { calls, client } = createClient();

    const result = await attachDomainToVercelProject({
      hubId: 'hub_123',
      vercelProjectId: 'prj_123',
      domain: 'learn.example.com',
      vercel: client,
      repository,
    });

    assert.equal(result.verified, false);
    assert.deepEqual(calls, ['add:prj_123:learn.example.com']);
    assert.deepEqual(updates[0], {
      hubId: 'hub_123',
      customDomain: 'learn.example.com',
      domainVerified: false,
    });
  });

  it('reuses existing project domain when Vercel reports an idempotent conflict', async () => {
    const { repository, updates } = createRepository();
    const { calls, client } = createClient({
      attachError: new VercelApiError({
        status: 409,
        code: 'domain_already_exists',
        message: 'Domain already exists',
        responseBody: {},
      }),
    });

    const result = await attachDomainToVercelProject({
      hubId: 'hub_123',
      vercelProjectId: 'prj_123',
      domain: 'learn.example.com',
      vercel: client,
      repository,
    });

    assert.equal(result.verified, true);
    assert.deepEqual(calls, [
      'add:prj_123:learn.example.com',
      'get:prj_123:learn.example.com',
    ]);
    assert.equal(updates[0]?.domainVerified, true);
  });

  it('does not treat domain-in-use elsewhere as idempotent', async () => {
    const { repository, updates } = createRepository();
    const { calls, client } = createClient({
      attachError: new VercelApiError({
        status: 409,
        code: 'domain_already_in_use',
        message: 'Domain belongs to another project',
        responseBody: {},
      }),
    });

    await assert.rejects(
      () =>
        attachDomainToVercelProject({
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          domain: 'learn.example.com',
          vercel: client,
          repository,
        }),
      VercelApiError,
    );

    assert.deepEqual(calls, ['add:prj_123:learn.example.com']);
    assert.equal(updates.length, 0);
  });
});

describe('domain verification refresh', () => {
  it('updates persisted verification state from Vercel project domain', async () => {
    const updates: boolean[] = [];
    const repository: DomainStatusRepository = {
      async findDomainStatusByHubId() {
        return {
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          customDomain: 'learn.example.com',
          domainVerified: false,
          sslReady: false,
          liveUrl: null,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async updateDomainVerification(input) {
        updates.push(input.domainVerified);
      },
      async updateSslStatus() {},
    };
    const vercel: Pick<VercelClient, 'getProjectDomain'> = {
      async getProjectDomain() {
        return {
          name: 'learn.example.com',
          projectId: 'prj_123',
          verified: true,
        };
      },
    };

    const result = await refreshDomainVerificationStatus({
      hubId: 'hub_123',
      vercel,
      repository,
    });

    assert.equal(result.domainVerified, true);
    assert.deepEqual(updates, [true]);
  });

  it('marks ssl ready when the verified Vercel domain config is not misconfigured', async () => {
    const updates: boolean[] = [];
    const repository: DomainStatusRepository = {
      async findDomainStatusByHubId() {
        return {
          hubId: 'hub_123',
          vercelProjectId: 'prj_123',
          customDomain: 'learn.example.com',
          domainVerified: true,
          sslReady: false,
          liveUrl: null,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      async updateDomainVerification() {},
      async updateSslStatus(input) {
        updates.push(input.sslReady);
      },
    };
    const vercel: Pick<VercelClient, 'getDomainConfig'> = {
      async getDomainConfig() {
        return {
          configuredBy: 'CNAME',
          acceptedChallenges: ['http-01'],
          recommendedIPv4: [],
          recommendedCNAME: [],
          misconfigured: false,
        };
      },
    };

    const result = await refreshSslStatus({
      hubId: 'hub_123',
      vercel,
      repository,
    });

    assert.equal(result.sslReady, true);
    assert.deepEqual(updates, [true]);
  });
});
